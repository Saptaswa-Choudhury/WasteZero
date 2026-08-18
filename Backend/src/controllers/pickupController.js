const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { validateCreatePickup } = require('../validators/pickupValidator');
const pickupService = require('../services/pickupService');

const createPickup = asyncHandler(async (req, res) => {
  const { error, value } = validateCreatePickup(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const pickup = await pickupService.createPickup(value, req.user.id);
  return ApiResponse.created(res, 'Pickup scheduled successfully', { pickup });
});

const getMyPickups = asyncHandler(async (req, res) => {
  const pickups = await pickupService.getMyPickups(req.user.id);
  return ApiResponse.ok(res, 'Pickups fetched successfully', { pickups });
});

const getPickupById = asyncHandler(async (req, res) => {
  const pickup = await pickupService.getPickupById(req.params.id, req.user.id, req.user.role);
  return ApiResponse.ok(res, 'Pickup fetched successfully', { pickup });
});

const cancelPickup = asyncHandler(async (req, res) => {
  const pickup = await pickupService.cancelPickup(req.params.id, req.user.id, req.user.role);
  return ApiResponse.ok(res, 'Pickup cancelled successfully', { pickup });
});

const getAvailablePickups = asyncHandler(async (req, res) => {
  const pickups = await pickupService.getAvailablePickups(req.user.id);
  return ApiResponse.ok(res, 'Available pickups fetched successfully', { pickups });
});

const getAcceptedPickups = asyncHandler(async (req, res) => {
  const pickups = await pickupService.getAcceptedPickups(req.user.id);
  return ApiResponse.ok(res, 'Accepted pickups fetched successfully', { pickups });
});

const acceptPickup = asyncHandler(async (req, res) => {
  const pickup = await pickupService.acceptPickup(req.params.id, req.user.id);
  return ApiResponse.ok(res, 'Pickup accepted successfully', { pickup });
});

const declinePickup = asyncHandler(async (req, res) => {
  const pickup = await pickupService.declinePickup(req.params.id, req.user.id);
  return ApiResponse.ok(res, 'Pickup declined successfully', { pickup });
});

const completePickup = asyncHandler(async (req, res) => {
  const pickup = await pickupService.completePickup(req.params.id, req.user.id);
  return ApiResponse.ok(res, 'Pickup marked as complete', { pickup });
});

module.exports = {
  createPickup,
  getMyPickups,
  getPickupById,
  cancelPickup,
  getAvailablePickups,
  getAcceptedPickups,
  acceptPickup,
  declinePickup,
  completePickup
};
