const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { APPLICATION_STATUS } = require('../constants/applicationStatus');
const { OPPORTUNITY_STATUS } = require('../constants/opportunityStatus');
const { NOTIFICATION_TYPE } = require('../constants/notificationType');
const notificationService = require('./notificationService');
const logger = require('../config/logger');

// Notifies the NGO behind an opportunity whenever a volunteer applies,
// re-applies after withdrawing, or withdraws. `verbPhrase` drives the wording.
const notifyNgoOfApplicationChange = async (opportunity, application, volunteerId, verbPhrase) => {
  try {
    const volunteer = await User.findById(volunteerId).select('name').lean();
    const volunteerName = volunteer?.name || 'A volunteer';

    await notificationService.createNotification({
      recipient: opportunity.ngo,
      sender: volunteerId,
      type: NOTIFICATION_TYPE.APPLICATION,
      title: verbPhrase === 'withdrew from' ? 'A volunteer withdrew' : 'New volunteer application',
      message: `${volunteerName} ${verbPhrase} "${opportunity.title}".`,
      link: `/opportunities/${opportunity._id}`,
      relatedId: application._id
    });
  } catch (error) {
    // Notification failures should never block the underlying application action.
    logger.error(`Failed to notify NGO of application change: ${error.message}`);
  }
};

// Notifies the volunteer once the NGO accepts or rejects their application.
const notifyVolunteerOfStatusChange = async (application, opportunity, reviewerId, newStatus) => {
  try {
    const reviewer = await User.findById(reviewerId).select('name').lean();
    const reviewerName = reviewer?.name || 'The NGO';
    const isAccepted = newStatus === APPLICATION_STATUS.ACCEPTED;

    await notificationService.createNotification({
      recipient: application.volunteer,
      sender: reviewerId,
      type: NOTIFICATION_TYPE.APPLICATION,
      title: isAccepted ? 'Your application was accepted' : 'Your application was rejected',
      message: isAccepted
        ? `${reviewerName} accepted your application for "${opportunity.title}".`
        : `${reviewerName} rejected your application for "${opportunity.title}".`,
      link: `/opportunities/${opportunity._id}`,
      relatedId: application._id
    });
  } catch (error) {
    // Notification failures should never block the underlying application action.
    logger.error(`Failed to notify volunteer of application status change: ${error.message}`);
  }
};

const joinOpportunity = async (opportunityId, volunteerId) => {
  const opportunity = await Opportunity.findById(opportunityId);
  if (!opportunity || opportunity.isDeleted) {
    throw ApiError.notFound('Opportunity not found');
  }

  if (opportunity.status !== OPPORTUNITY_STATUS.OPEN) {
    throw ApiError.badRequest('This opportunity is no longer accepting volunteers');
  }

  if (opportunity.applicationDeadline && opportunity.applicationDeadline < new Date()) {
    throw ApiError.badRequest('The application deadline for this opportunity has passed');
  }

  if (opportunity.maxVolunteers > 0) {
    const acceptedCount = await Application.countDocuments({
      opportunity: opportunityId,
      status: { $in: [APPLICATION_STATUS.PENDING, APPLICATION_STATUS.ACCEPTED] }
    });

    if (acceptedCount >= opportunity.maxVolunteers) {
      throw ApiError.badRequest('This opportunity has reached its maximum number of volunteers');
    }
  }

  const existing = await Application.findOne({ opportunity: opportunityId, volunteer: volunteerId });
  if (existing) {
    if (existing.status === APPLICATION_STATUS.WITHDRAWN) {
      existing.status = APPLICATION_STATUS.PENDING;
      existing.updatedBy = volunteerId;
      existing.reviewedBy = null;
      existing.reviewedAt = null;
      await existing.save();

      await notifyNgoOfApplicationChange(opportunity, existing, volunteerId, 'applied to join');
      return existing;
    }
    throw ApiError.conflict('You have already joined this opportunity');
  }

  const application = await Application.create({
    opportunity: opportunityId,
    volunteer: volunteerId,
    status: APPLICATION_STATUS.PENDING
  });

  await notifyNgoOfApplicationChange(opportunity, application, volunteerId, 'applied to join');
  return application;
};

const withdrawApplication = async (opportunityId, volunteerId) => {
  const application = await Application.findOne({ opportunity: opportunityId, volunteer: volunteerId });

  if (!application || application.status === APPLICATION_STATUS.WITHDRAWN) {
    throw ApiError.notFound('You have not joined this opportunity');
  }

  application.status = APPLICATION_STATUS.WITHDRAWN;
  application.updatedBy = volunteerId;
  await application.save();

  const opportunity = await Opportunity.findById(opportunityId).select('title ngo').lean();
  if (opportunity) {
    await notifyNgoOfApplicationChange(opportunity, application, volunteerId, 'withdrew from');
  }

  return application;
};

const getMyApplications = async (volunteerId) => {
  const applications = await Application.find({ volunteer: volunteerId })
    .populate('opportunity', 'title status location duration')
    .sort({ createdAt: -1 })
    .lean();

  applications.forEach((app) => delete app.__v);
  return applications;
};

const getApplicantsForOpportunity = async (opportunityId, requesterId, requesterRole) => {
  const opportunity = await Opportunity.findById(opportunityId);
  if (!opportunity || opportunity.isDeleted) {
    throw ApiError.notFound('Opportunity not found');
  }

  if (requesterRole !== 'admin' && opportunity.ngo.toString() !== requesterId) {
    throw ApiError.forbidden('You are not allowed to view applicants for this opportunity');
  }

  const applications = await Application.find({ opportunity: opportunityId })
    .populate('volunteer', 'name email skills')
    .sort({ createdAt: -1 })
    .lean();

  applications.forEach((app) => delete app.__v);
  return applications;
};

const ALLOWED_APPLICATION_TRANSITIONS = {
  [APPLICATION_STATUS.PENDING]: [APPLICATION_STATUS.ACCEPTED, APPLICATION_STATUS.REJECTED],
  [APPLICATION_STATUS.ACCEPTED]: [APPLICATION_STATUS.REJECTED],
  [APPLICATION_STATUS.REJECTED]: [APPLICATION_STATUS.ACCEPTED],
  [APPLICATION_STATUS.WITHDRAWN]: []
};

const updateApplicationStatus = async (applicationId, newStatus, reviewerId, reviewerRole) => {
  const application = await Application.findById(applicationId).populate('opportunity');

  if (!application) {
    throw ApiError.notFound('Application not found');
  }

  const opportunity = application.opportunity;
  if (!opportunity || opportunity.isDeleted) {
    throw ApiError.notFound('Opportunity not found');
  }

  if (reviewerRole !== 'admin' && opportunity.ngo.toString() !== reviewerId) {
    throw ApiError.forbidden('You are not allowed to review applicants for this opportunity');
  }

  if (application.status === newStatus) {
    return application;
  }

  const allowed = ALLOWED_APPLICATION_TRANSITIONS[application.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw ApiError.badRequest(`Cannot change application status from ${application.status} to ${newStatus}`);
  }

  if (newStatus === APPLICATION_STATUS.ACCEPTED && opportunity.maxVolunteers > 0) {
    const acceptedCount = await Application.countDocuments({
      opportunity: opportunity._id,
      status: APPLICATION_STATUS.ACCEPTED
    });

    if (acceptedCount >= opportunity.maxVolunteers) {
      throw ApiError.badRequest('This opportunity has already reached its maximum number of volunteers');
    }
  }

  application.status = newStatus;
  application.updatedBy = reviewerId;
  application.reviewedBy = reviewerId;
  application.reviewedAt = new Date();
  await application.save();

  if (newStatus === APPLICATION_STATUS.ACCEPTED || newStatus === APPLICATION_STATUS.REJECTED) {
    await notifyVolunteerOfStatusChange(application, opportunity, reviewerId, newStatus);
  }

  return application;
};

module.exports = {
  joinOpportunity,
  withdrawApplication,
  getMyApplications,
  getApplicantsForOpportunity,
  updateApplicationStatus
};
