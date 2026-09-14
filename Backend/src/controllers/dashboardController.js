const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');

const Pickup = require('../models/Pickup');
const Application = require('../models/Application');

const { ROLES } = require('../constants/roles');
const { PICKUP_STATUS } = require('../constants/pickupStatus');
const { APPLICATION_STATUS } = require('../constants/applicationStatus');

// These two constants translate "a completed pickup" into physical-world
// impact numbers. The schema doesn't capture an actual measured weight per
// pickup, so we use reasonable per-pickup averages (documented here) rather
// than inventing per-pickup weight data that doesn't exist.
const AVG_KG_PER_PICKUP = 4.5;
const CO2_KG_SAVED_PER_KG_RECYCLED = 0.5;

// Rough hour-equivalents used to translate an opportunity's duration into
// "volunteer hours" for the impact stat.
const HOURS_PER_UNIT = { hours: 1, days: 8, weeks: 40, months: 160 };

const startOfMonth = (offset = 0) => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() + offset);
  return d;
};

const pctChange = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

const pickupFilterFor = (userId, role) => {
  // Cast explicitly: Pickup.aggregate() talks to the MongoDB driver directly
  // and does NOT run the value through Mongoose's schema-based casting the
  // way find()/countDocuments() do, so a raw string id would silently fail
  // to match the ObjectId-typed `user`/`ngo` fields in the aggregation
  // pipeline below (even though it happens to work for find/countDocuments).
  const objectId = new mongoose.Types.ObjectId(userId);
  if (role === ROLES.VOLUNTEER) return { user: objectId };
  if (role === ROLES.NGO) return { ngo: objectId };
  return {}; // admin sees platform-wide numbers
};

const getVolunteerHours = async (userId, role, from, to) => {
  const match = { status: APPLICATION_STATUS.ACCEPTED };
  if (from || to) {
    match.reviewedAt = {};
    if (from) match.reviewedAt.$gte = from;
    if (to) match.reviewedAt.$lt = to;
  }
  if (role === ROLES.VOLUNTEER) match.volunteer = userId;

  const applications = await Application.find(match)
    .populate('opportunity', 'duration ngo')
    .lean();

  const relevant =
    role === ROLES.NGO
      ? applications.filter((a) => a.opportunity && a.opportunity.ngo?.toString() === userId)
      : applications;

  return relevant.reduce((sum, a) => {
    const duration = a.opportunity?.duration;
    if (!duration) return sum;
    const hoursPerUnit = HOURS_PER_UNIT[duration.unit] || 1;
    return sum + duration.value * hoursPerUnit;
  }, 0);
};

const getDashboardStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  const pickupFilter = pickupFilterFor(userId, role);

  const thisMonthStart = startOfMonth(0);
  const lastMonthStart = startOfMonth(-1);

  const [
    totalPickups,
    completedPickups,
    thisMonthTotal,
    lastMonthTotal,
    thisMonthCompleted,
    lastMonthCompleted,
    upcomingPickups,
    breakdownThisMonth,
    thisMonthHours,
    lastMonthHours
  ] = await Promise.all([
    Pickup.countDocuments(pickupFilter),
    Pickup.countDocuments({ ...pickupFilter, status: PICKUP_STATUS.COMPLETED }),
    Pickup.countDocuments({ ...pickupFilter, createdAt: { $gte: thisMonthStart } }),
    Pickup.countDocuments({ ...pickupFilter, createdAt: { $gte: lastMonthStart, $lt: thisMonthStart } }),
    Pickup.countDocuments({ ...pickupFilter, status: PICKUP_STATUS.COMPLETED, completedAt: { $gte: thisMonthStart } }),
    Pickup.countDocuments({
      ...pickupFilter,
      status: PICKUP_STATUS.COMPLETED,
      completedAt: { $gte: lastMonthStart, $lt: thisMonthStart }
    }),
    Pickup.find({
      ...pickupFilter,
      status: { $in: [PICKUP_STATUS.PENDING, PICKUP_STATUS.IN_PROGRESS] },
      pickupDate: { $gte: new Date() }
    })
      .sort({ pickupDate: 1 })
      .limit(5)
      .lean(),
    Pickup.aggregate([
      { $match: { ...pickupFilter, createdAt: { $gte: thisMonthStart } } },
      { $unwind: '$wasteTypes' },
      { $group: { _id: '$wasteTypes', count: { $sum: 1 } } }
    ]),
    getVolunteerHours(userId, role, thisMonthStart, null),
    getVolunteerHours(userId, role, lastMonthStart, thisMonthStart)
  ]);

  // If this account has no pickups created in the current calendar month yet,
  // fall back to an all-time breakdown so the chart isn't just empty - the
  // frontend switches its "This Month" label to "All Time" when this happens.
  let breakdownRaw = breakdownThisMonth;
  let breakdownIsAllTime = false;
  if (breakdownRaw.reduce((sum, b) => sum + b.count, 0) === 0) {
    breakdownRaw = await Pickup.aggregate([
      { $match: pickupFilter },
      { $unwind: '$wasteTypes' },
      { $group: { _id: '$wasteTypes', count: { $sum: 1 } } }
    ]);
    breakdownIsAllTime = true;
  }

  const totalCollectedKg = Math.round(completedPickups * AVG_KG_PER_PICKUP * 10) / 10;
  const co2SavedKg = Math.round(totalCollectedKg * CO2_KG_SAVED_PER_KG_RECYCLED);
  const volunteerHours = await getVolunteerHours(userId, role, null, null);

  const breakdownTotal = breakdownRaw.reduce((sum, b) => sum + b.count, 0);
  const recyclingBreakdown = breakdownRaw
    .map((b) => ({
      category: b._id,
      percent: breakdownTotal ? Math.round((b.count / breakdownTotal) * 100) : 0
    }))
    .sort((a, b) => b.percent - a.percent);

  return ApiResponse.ok(res, 'Dashboard stats fetched successfully', {
    totalPickups,
    completedPickups,
    recycledItems: completedPickups,
    co2SavedKg,
    volunteerHours: Math.round(volunteerHours),
    totalCollectedKg,
    recyclingBreakdown,
    recyclingBreakdownIsAllTime: breakdownIsAllTime,
    upcomingPickups,
    trends: {
      totalPickups: pctChange(thisMonthTotal, lastMonthTotal),
      recycledItems: pctChange(thisMonthCompleted, lastMonthCompleted),
      co2SavedKg: pctChange(thisMonthCompleted, lastMonthCompleted),
      volunteerHours: pctChange(Math.round(thisMonthHours), Math.round(lastMonthHours))
    }
  });
});

module.exports = { getDashboardStats };
