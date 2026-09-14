const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { validateCreateApplication, validateUpdateApplicationStatus } = require('../validators/applicationValidator');
const applicationService = require('../services/applicationService');

const joinOpportunity = asyncHandler(async (req, res) => {
  const { error, value } = validateCreateApplication(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const application = await applicationService.joinOpportunity(value.opportunity, req.user.id);
  return ApiResponse.created(res, 'You have successfully joined this opportunity', { application });
});

const withdrawApplication = asyncHandler(async (req, res) => {
  const application = await applicationService.withdrawApplication(req.params.opportunityId, req.user.id);
  return ApiResponse.ok(res, 'You have withdrawn from this opportunity', { application });
});

const getMyApplications = asyncHandler(async (req, res) => {
  const applications = await applicationService.getMyApplications(req.user.id);
  return ApiResponse.ok(res, 'Applications fetched successfully', { applications });
});

const getApplicantsForOpportunity = asyncHandler(async (req, res) => {
  const applications = await applicationService.getApplicantsForOpportunity(
    req.params.opportunityId,
    req.user.id,
    req.user.role
  );
  return ApiResponse.ok(res, 'Applicants fetched successfully', { applications });
});

const updateApplicationStatus = asyncHandler(async (req, res) => {
  const { error, value } = validateUpdateApplicationStatus(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const application = await applicationService.updateApplicationStatus(
    req.params.id,
    value.status,
    req.user.id,
    req.user.role
  );
  return ApiResponse.ok(res, 'Application status updated successfully', { application });
});

module.exports = {
  joinOpportunity,
  withdrawApplication,
  getMyApplications,
  getApplicantsForOpportunity,
  updateApplicationStatus
};
