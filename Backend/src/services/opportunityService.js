const Opportunity = require('../models/Opportunity');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { distanceKm } = require('../utils/geo');
const { OPPORTUNITY_STATUS } = require('../constants/opportunityStatus');
const { ROLES } = require('../constants/roles');
const { OPPORTUNITY_IMAGE_SUBDIR } = require('../constants/upload');
const { saveBase64Image, deleteImageFile } = require('../utils/imageStorage');
const notificationService = require('./notificationService');

const ALLOWED_TRANSITIONS = {
  [OPPORTUNITY_STATUS.OPEN]: [OPPORTUNITY_STATUS.IN_PROGRESS, OPPORTUNITY_STATUS.CLOSED, OPPORTUNITY_STATUS.CANCELLED],
  [OPPORTUNITY_STATUS.IN_PROGRESS]: [OPPORTUNITY_STATUS.CLOSED],
  [OPPORTUNITY_STATUS.CLOSED]: [OPPORTUNITY_STATUS.OPEN],
  [OPPORTUNITY_STATUS.CANCELLED]: []
};

const createOpportunity = async (data, userId) => {
  const payload = { ...data };

  // `image`, when provided, arrives as a base64 data URL - upload it to Cloudinary and
  // store the resulting secure URL (plus the public ID, needed later for replace/delete).
  if (payload.image) {
    const uploaded = await saveBase64Image(payload.image, OPPORTUNITY_IMAGE_SUBDIR);
    payload.image = uploaded.url;
    payload.imagePublicId = uploaded.publicId;
  }

  const opportunity = await Opportunity.create({
    ...payload,
    status: OPPORTUNITY_STATUS.OPEN,
    ngo: userId,
    createdBy: userId,
    updatedBy: userId
  });

  // Fire-and-forget: notification delivery should never block/break opportunity creation.
  notificationService.notifyMatchingVolunteers(opportunity).catch(() => {});

  return opportunity;
};

const buildFilterQuery = (query) => {
  const filter = { isDeleted: false };

  if (query.search) {
    filter.$text = { $search: query.search };
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.location) {
    filter['location.city'] = { $regex: new RegExp(`^${query.location}$`, 'i') };
  }

  if (query.skill) {
    filter.requiredSkills = { $in: [query.skill.toLowerCase()] };
  }

  return filter;
};

const getPaginationOptions = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  // Used only as a tie-breaker / fallback when proximity can't be determined.
  const chronoSort = query.sort === 'oldest' ? 1 : -1;

  return { page, limit, skip, chronoSort };
};

/**
 * Opportunities are shown closest-to-the-requester first. NGOs additionally see their
 * own posted opportunities ahead of everyone else's (still ordered by proximity within
 * that group). Distance requires both the requester's city and the opportunity's city
 * to have coordinates - when either is missing we fall back to recency. When two
 * opportunities are equidistant, the one whose required skills overlap more with the
 * requester's own skills is shown first.
 */
const getAllOpportunities = async (query, requestingUser) => {
  const filter = buildFilterQuery(query);
  const { page, limit, skip, chronoSort } = getPaginationOptions(query);

  const [opportunities, total] = await Promise.all([
    Opportunity.find(filter).populate('ngo', 'name email').lean(),
    Opportunity.countDocuments(filter)
  ]);

  opportunities.forEach((opp) => delete opp.__v);

  let requesterCity = null;
  let requesterSkills = [];
  if (requestingUser?.id) {
    const requester = await User.findById(requestingUser.id).lean();
    if (requester?.city && requester.city.lat != null && requester.city.lng != null) {
      requesterCity = requester.city;
    }
    if (Array.isArray(requester?.skills)) {
      requesterSkills = requester.skills.map((s) => s.trim().toLowerCase()).filter(Boolean);
    }
  }

  const countMatchingSkills = (requiredSkills) => {
    if (!requesterSkills.length || !Array.isArray(requiredSkills) || !requiredSkills.length) {
      return 0;
    }
    const requesterSkillSet = new Set(requesterSkills);
    // requiredSkills are already normalized (trimmed/lowercased) by the Opportunity model.
    return requiredSkills.reduce((count, skill) => count + (requesterSkillSet.has(skill) ? 1 : 0), 0);
  };

  const withDistance = opportunities.map((opp) => {
    const matchingSkills = countMatchingSkills(opp.requiredSkills);

    if (!requesterCity || opp.lat == null || opp.lng == null) {
      return { ...opp, matchingSkills };
    }
    const sameCity = opp.location?.city?.trim().toLowerCase() === requesterCity.name.trim().toLowerCase();
    const distance = distanceKm(requesterCity.lat, requesterCity.lng, opp.lat, opp.lng);
    return { ...opp, sameCity, distanceKm: Math.round(distance * 10) / 10, matchingSkills };
  });

  const isOwnedByRequester = (opp) => {
    if (requestingUser?.role !== ROLES.NGO) return false;
    const ngoId = opp.ngo?._id ? opp.ngo._id.toString() : opp.ngo?.toString();
    return ngoId === requestingUser.id;
  };

  withDistance.sort((a, b) => {
    const aOwn = isOwnedByRequester(a) ? 0 : 1;
    const bOwn = isOwnedByRequester(b) ? 0 : 1;
    if (aOwn !== bOwn) return aOwn - bOwn;

    if (a.distanceKm != null && b.distanceKm != null) {
      if (a.sameCity !== b.sameCity) return a.sameCity ? -1 : 1;
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      // Same distance (and same-city status) - prefer the opportunity that matches
      // more of the requester's skills.
      if (a.matchingSkills !== b.matchingSkills) return b.matchingSkills - a.matchingSkills;
    }

    return chronoSort * (new Date(a.createdAt) - new Date(b.createdAt));
  });

  const paginated = withDistance.slice(skip, skip + limit);

  return {
    opportunities: paginated,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

const getOpportunityById = async (id) => {
  const opportunity = await Opportunity.findOne({ _id: id, isDeleted: false })
    .populate('ngo', 'name email')
    .lean();
  if (!opportunity) {
    throw ApiError.notFound('Opportunity not found');
  }
  delete opportunity.__v;
  return opportunity;
};

const validateStatusTransition = (currentStatus, newStatus, userId, userRole) => {
  if (currentStatus === newStatus) {
    return;
  }

  if (newStatus === OPPORTUNITY_STATUS.OPEN && currentStatus === OPPORTUNITY_STATUS.CLOSED) {
    if (userRole !== ROLES.ADMIN) {
      throw ApiError.forbidden('Only admins can reopen a closed opportunity');
    }
    return;
  }

  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw ApiError.badRequest(
      `Cannot transition from ${currentStatus} to ${newStatus}`
    );
  }
};

const updateOpportunity = async (id, data, userId, userRole) => {
  const opportunity = await Opportunity.findById(id).select('+imagePublicId');
  if (!opportunity || opportunity.isDeleted) {
    throw ApiError.notFound('Opportunity not found');
  }

  if (data.status && data.status !== opportunity.status) {
    validateStatusTransition(opportunity.status, data.status, userId, userRole);
  }

  if (data.applicationDeadline && data.applicationDeadline <= new Date()) {
    throw ApiError.badRequest('Application deadline must be in the future');
  }

  // `image` field handling:
  // - a new base64 data URL -> upload the new asset, replace the old one
  // - an explicit empty string/null -> remove the current image
  // - omitted entirely -> leave the existing image untouched
  if (Object.prototype.hasOwnProperty.call(data, 'image')) {
    const previousPublicId = opportunity.imagePublicId;

    if (data.image) {
      const uploaded = await saveBase64Image(data.image, OPPORTUNITY_IMAGE_SUBDIR);
      data.image = uploaded.url;
      data.imagePublicId = uploaded.publicId;
    } else {
      data.image = null;
      data.imagePublicId = null;
    }

    if (previousPublicId && previousPublicId !== data.imagePublicId) {
      await deleteImageFile(previousPublicId);
    }
  }

  data.updatedBy = userId;

  const updated = await Opportunity.findByIdAndUpdate(id, data, {
    returnDocument: 'after',
    runValidators: true
  });

  return updated;
};

const deleteOpportunity = async (id, userId) => {
  const opportunity = await Opportunity.findById(id);
  if (!opportunity || opportunity.isDeleted) {
    throw ApiError.notFound('Opportunity not found');
  }

  opportunity.isDeleted = true;
  opportunity.deletedAt = new Date();
  opportunity.updatedBy = userId;
  await opportunity.save();

  return { id, deletedAt: opportunity.deletedAt };
};

const changeStatus = async (id, newStatus, userId, userRole) => {
  const opportunity = await Opportunity.findById(id);
  if (!opportunity || opportunity.isDeleted) {
    throw ApiError.notFound('Opportunity not found');
  }

  validateStatusTransition(opportunity.status, newStatus, userId, userRole);

  opportunity.status = newStatus;
  opportunity.updatedBy = userId;
  await opportunity.save();

  return opportunity;
};

module.exports = {
  createOpportunity,
  getAllOpportunities,
  getOpportunityById,
  updateOpportunity,
  deleteOpportunity,
  changeStatus
};
