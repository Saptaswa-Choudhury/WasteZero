const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const { buildReportPdf } = require('../utils/pdfReport');

const User = require('../models/User');
const Pickup = require('../models/Pickup');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Message = require('../models/Message');
const AdminLog = require('../models/AdminLog');

const { ROLES } = require('../constants/roles');
const { PICKUP_STATUS } = require('../constants/pickupStatus');
const { OPPORTUNITY_STATUS } = require('../constants/opportunityStatus');
const { ADMIN_ACTIONS } = require('../constants/adminActions');
const { TARGET_TYPES } = require('../constants/targetTypes');

const writeLog = (req, { action, targetType, targetId, details }) =>
  AdminLog.create({
    admin: req.user.id,
    action,
    targetType,
    targetId,
    details: details || {},
    ipAddress: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null
  });

// ---------------------------------------------------------------------------
// Dashboard stats (platform-wide totals shown on the Admin Panel landing view)
// ---------------------------------------------------------------------------
const getStats = asyncHandler(async (req, res) => {
  const [totalUsers, completedPickups, pendingPickups, activeOpportunities] = await Promise.all([
    User.countDocuments({}),
    Pickup.countDocuments({ status: PICKUP_STATUS.COMPLETED }),
    Pickup.countDocuments({ status: PICKUP_STATUS.PENDING }),
    Opportunity.countDocuments({ status: OPPORTUNITY_STATUS.OPEN, isDeleted: { $ne: true } })
  ]);

  return ApiResponse.ok(res, 'Admin stats fetched successfully', {
    totalUsers,
    completedPickups,
    pendingPickups,
    activeOpportunities
  });
});

// ---------------------------------------------------------------------------
// Manage Users
// ---------------------------------------------------------------------------
const getUsers = asyncHandler(async (req, res) => {
  const { q = '', role = '', status = '', page = 1, limit = 20 } = req.query;

  const filter = {};
  if (q.trim()) {
    const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [{ name: regex }, { email: regex }];
  }
  if (role && ['volunteer', 'ngo', 'admin'].includes(role)) {
    filter.role = role;
  }
  if (status === 'suspended') filter.isSuspended = true;
  if (status === 'active') filter.isSuspended = { $ne: true };

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('name email role isSuspended isEmailVerified createdAt city')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    User.countDocuments(filter)
  ]);

  return ApiResponse.ok(res, 'Users fetched successfully', {
    users,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
  });
});

const setUserSuspension = asyncHandler(async (req, res) => {
  const { suspend, reason = '' } = req.body;

  if (typeof suspend !== 'boolean') {
    throw ApiError.badRequest('The "suspend" field must be true or false');
  }

  const target = await User.findById(req.params.id);
  if (!target) {
    throw ApiError.notFound('User not found');
  }

  if (target.role === ROLES.ADMIN) {
    throw ApiError.forbidden('Admin accounts cannot be suspended');
  }

  if (target._id.toString() === req.user.id) {
    throw ApiError.forbidden('You cannot suspend your own account');
  }

  target.isSuspended = suspend;
  target.suspendedAt = suspend ? new Date() : null;
  target.suspendedReason = suspend ? String(reason).slice(0, 300) : '';
  await target.save();

  await writeLog(req, {
    action: suspend ? ADMIN_ACTIONS.UPDATE : ADMIN_ACTIONS.RESTORE,
    targetType: TARGET_TYPES.USER,
    targetId: target._id,
    details: { name: target.name, email: target.email, suspended: suspend, reason: target.suspendedReason }
  });

  return ApiResponse.ok(res, suspend ? 'User suspended successfully' : 'User reinstated successfully', {
    user: {
      _id: target._id,
      name: target.name,
      email: target.email,
      role: target.role,
      isSuspended: target.isSuspended
    }
  });
});

// ---------------------------------------------------------------------------
// Remove posts (opportunities) - platform moderation
// ---------------------------------------------------------------------------
const removeOpportunity = asyncHandler(async (req, res) => {
  const opportunity = await Opportunity.findById(req.params.id);
  if (!opportunity || opportunity.isDeleted) {
    throw ApiError.notFound('Opportunity not found');
  }

  opportunity.isDeleted = true;
  opportunity.deletedAt = new Date();
  opportunity.updatedBy = req.user.id;
  await opportunity.save();

  await writeLog(req, {
    action: ADMIN_ACTIONS.DELETE,
    targetType: TARGET_TYPES.OPPORTUNITY,
    targetId: opportunity._id,
    details: { title: opportunity.title }
  });

  return ApiResponse.ok(res, 'Opportunity removed successfully', { id: opportunity._id });
});

// ---------------------------------------------------------------------------
// Admin activity logs
// ---------------------------------------------------------------------------
const getLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [logs, total] = await Promise.all([
    AdminLog.find({})
      .populate('admin', 'name email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    AdminLog.countDocuments({})
  ]);

  return ApiResponse.ok(res, 'Admin logs fetched successfully', {
    logs,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
  });
});

// ---------------------------------------------------------------------------
// Downloadable analytical reports (CSV)
// ---------------------------------------------------------------------------
const downloadReport = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const validTypes = ['users', 'pickups', 'opportunities', 'full'];
  if (!validTypes.includes(type)) {
    throw ApiError.badRequest('Invalid report type. Must be one of: ' + validTypes.join(', '));
  }

  let columns;
  let rows;
  let chips;
  let title;
  let subtitle;
  let filename;

  if (type === 'users') {
    const users = await User.find({}).select('name email role isSuspended isEmailVerified createdAt').lean();

    columns = [
      { label: 'Name', key: 'name', weight: 2 },
      { label: 'Email', key: 'email', weight: 2.5 },
      { label: 'Role', key: 'role', weight: 1 },
      { label: 'Status', key: 'status', weight: 1 },
      { label: 'Verified', key: 'verified', weight: 1 },
      { label: 'Joined', key: 'joined', weight: 1.3 }
    ];
    rows = users.map((u) => ({
      name: u.name,
      email: u.email,
      role: u.role.charAt(0).toUpperCase() + u.role.slice(1),
      status: u.isSuspended ? 'Suspended' : 'Active',
      verified: u.isEmailVerified ? 'Yes' : 'No',
      joined: new Date(u.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    }));
    chips = [
      { label: 'Total Users', value: users.length },
      { label: 'Active', value: users.filter((u) => !u.isSuspended).length },
      { label: 'Suspended', value: users.filter((u) => u.isSuspended).length },
      { label: 'Admins', value: users.filter((u) => u.role === ROLES.ADMIN).length }
    ];
    title = 'Users Report';
    subtitle = 'All registered accounts and their current status';
    filename = 'wastezero-users-report.pdf';
  } else if (type === 'pickups') {
    const pickups = await Pickup.find({})
      .populate('user', 'name email')
      .populate('ngo', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    columns = [
      { label: 'Volunteer', key: 'volunteer', weight: 1.6 },
      { label: 'Agent', key: 'agent', weight: 1.6 },
      { label: 'City', key: 'city', weight: 1.2 },
      { label: 'Waste Types', key: 'wasteTypes', weight: 1.8 },
      { label: 'Status', key: 'status', weight: 1 },
      { label: 'Pickup Date', key: 'pickupDate', weight: 1.2 },
      { label: 'Created', key: 'created', weight: 1.2 }
    ];
    rows = pickups.map((p) => ({
      volunteer: p.user?.name || 'Unknown',
      agent: p.ngo?.name || 'Unassigned',
      city: p.city,
      wasteTypes: (p.wasteTypes || []).join(', '),
      status: p.status,
      pickupDate: new Date(p.pickupDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      created: new Date(p.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    }));
    chips = [
      { label: 'Total Pickups', value: pickups.length },
      { label: 'Completed', value: pickups.filter((p) => p.status === PICKUP_STATUS.COMPLETED).length },
      { label: 'Pending', value: pickups.filter((p) => p.status === PICKUP_STATUS.PENDING).length },
      { label: 'In Progress', value: pickups.filter((p) => p.status === PICKUP_STATUS.IN_PROGRESS).length }
    ];
    title = 'Pickups Report';
    subtitle = 'All scheduled waste pickups across the platform';
    filename = 'wastezero-pickups-report.pdf';
  } else if (type === 'opportunities') {
    const opportunities = await Opportunity.find({ isDeleted: { $ne: true } })
      .populate('ngo', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    const applicationCounts = await Application.aggregate([
      { $group: { _id: '$opportunity', count: { $sum: 1 } } }
    ]);
    const countMap = new Map(applicationCounts.map((a) => [a._id.toString(), a.count]));

    columns = [
      { label: 'Title', key: 'title', weight: 2.2 },
      { label: 'Posted By', key: 'postedBy', weight: 1.6 },
      { label: 'Location', key: 'location', weight: 1.6 },
      { label: 'Status', key: 'status', weight: 1 },
      { label: 'Applicants', key: 'applicants', weight: 1, align: 'center' },
      { label: 'Created', key: 'created', weight: 1.2 }
    ];
    rows = opportunities.map((o) => ({
      title: o.title,
      postedBy: o.ngo?.name || 'Unknown',
      location: `${o.location?.city || ''}, ${o.location?.state || ''}`,
      status: o.status,
      applicants: countMap.get(o._id.toString()) || 0,
      created: new Date(o.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    }));
    chips = [
      { label: 'Total Opportunities', value: opportunities.length },
      { label: 'Open', value: opportunities.filter((o) => o.status === OPPORTUNITY_STATUS.OPEN).length },
      {
        label: 'Total Applicants',
        value: Array.from(countMap.values()).reduce((sum, n) => sum + n, 0)
      }
    ];
    title = 'Opportunities Report';
    subtitle = 'Volunteering opportunities posted by NGOs';
    filename = 'wastezero-opportunities-report.pdf';
  } else {
    // Full activity report: one row per admin log entry, i.e. every
    // moderation action taken on the platform.
    const logs = await AdminLog.find({}).populate('admin', 'name email').sort({ createdAt: -1 }).lean();

    columns = [
      { label: 'Timestamp', key: 'timestamp', weight: 1.6 },
      { label: 'Admin', key: 'admin', weight: 1.4 },
      { label: 'Action', key: 'action', weight: 1 },
      { label: 'Target Type', key: 'targetType', weight: 1.2 },
      { label: 'Details', key: 'details', weight: 2.8 }
    ];
    rows = logs.map((l) => ({
      timestamp: new Date(l.createdAt).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }),
      admin: l.admin?.name || 'Unknown',
      action: l.action,
      targetType: l.targetType,
      details: JSON.stringify(l.details || {})
    }));
    chips = [{ label: 'Total Actions Logged', value: logs.length }];
    title = 'Full Activity Report';
    subtitle = 'Complete log of administrative moderation actions';
    filename = 'wastezero-full-activity-report.pdf';
  }

  await writeLog(req, {
    action: ADMIN_ACTIONS.EXPORT,
    targetType: TARGET_TYPES.ADMINLOG,
    targetId: req.user.id,
    details: { reportType: type }
  });

  const doc = buildReportPdf({ title, subtitle, generatedBy: req.user.name || 'Admin', columns, rows, chips });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  doc.end();
});

module.exports = {
  getStats,
  getUsers,
  setUserSuspension,
  removeOpportunity,
  getLogs,
  downloadReport
};
