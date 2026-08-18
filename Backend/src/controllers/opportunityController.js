const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { validateCreateOpportunity, validateUpdateOpportunity, validateStatusChange } = require('../validators/opportunityValidator');
const opportunityService = require('../services/opportunityService');

const createOpportunity = asyncHandler(async (req, res) => {
  const { error, value } = validateCreateOpportunity(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const opportunity = await opportunityService.createOpportunity(value, req.user.id);
  return ApiResponse.created(res, 'Opportunity created successfully', { opportunity });
});

const getAllOpportunities = asyncHandler(async (req, res) => {
  const result = await opportunityService.getAllOpportunities(req.query, req.user);
  return ApiResponse.ok(res, 'Opportunities fetched successfully', result);
});

const getOpportunityById = asyncHandler(async (req, res) => {
  const opportunity = await opportunityService.getOpportunityById(req.params.id);
  return ApiResponse.ok(res, 'Opportunity fetched successfully', { opportunity });
});

const updateOpportunity = asyncHandler(async (req, res) => {
  const { error, value } = validateUpdateOpportunity(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const opportunity = await opportunityService.updateOpportunity(req.params.id, value, req.user.id, req.user.role);
  return ApiResponse.ok(res, 'Opportunity updated successfully', { opportunity });
});

const deleteOpportunity = asyncHandler(async (req, res) => {
  const result = await opportunityService.deleteOpportunity(req.params.id, req.user.id);
  return ApiResponse.ok(res, 'Opportunity deleted successfully', result);
});

const changeOpportunityStatus = asyncHandler(async (req, res) => {
  const { error, value } = validateStatusChange(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const opportunity = await opportunityService.changeStatus(req.params.id, value.status, req.user.id, req.user.role);
  return ApiResponse.ok(res, 'Opportunity status updated successfully', { opportunity });
});

module.exports = {
  createOpportunity,
  getAllOpportunities,
  getOpportunityById,
  updateOpportunity,
  deleteOpportunity,
  changeOpportunityStatus
};
