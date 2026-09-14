const Pickup = require('../models/Pickup');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { distanceKm } = require('../utils/geo');
const { PICKUP_STATUS } = require('../constants/pickupStatus');
const { ROLES } = require('../constants/roles');
const { NOTIFICATION_TYPE } = require('../constants/notificationType');
const notificationService = require('./notificationService');

const createPickup = async (data, userId) => {
  const pickup = await Pickup.create({
    ...data,
    user: userId,
    status: PICKUP_STATUS.PENDING
  });

  return pickup;
};

const getMyPickups = async (userId) => {
  const pickups = await Pickup.find({ user: userId })
    .populate('ngo', 'name email')
    .sort({ pickupDate: -1, createdAt: -1 })
    .lean();

  pickups.forEach((p) => delete p.__v);
  return pickups;
};

const getPickupById = async (id, userId, userRole) => {
  const pickup = await Pickup.findById(id).populate('ngo', 'name email').lean();

  if (!pickup) {
    throw ApiError.notFound('Pickup not found');
  }

  const isOwner = pickup.user.toString() === userId;
  const isAssignedNgo = pickup.ngo && pickup.ngo._id.toString() === userId;

  if (userRole !== ROLES.ADMIN && !isOwner && !isAssignedNgo) {
    throw ApiError.forbidden('You are not allowed to view this pickup');
  }

  delete pickup.__v;
  return pickup;
};

const cancelPickup = async (id, userId, userRole) => {
  const pickup = await Pickup.findById(id);

  if (!pickup) {
    throw ApiError.notFound('Pickup not found');
  }

  if (userRole !== ROLES.ADMIN && pickup.user.toString() !== userId) {
    throw ApiError.forbidden('You are not allowed to cancel this pickup');
  }

  if (pickup.status === PICKUP_STATUS.CANCELLED) {
    throw ApiError.badRequest('This pickup has already been cancelled');
  }

  if (pickup.status === PICKUP_STATUS.COMPLETED) {
    throw ApiError.badRequest('A completed pickup cannot be cancelled');
  }

  pickup.status = PICKUP_STATUS.CANCELLED;
  pickup.cancelledAt = new Date();
  await pickup.save();

  return pickup;
};

const getAvailablePickups = async (ngoId) => {
  const ngo = await User.findById(ngoId).lean();
  if (!ngo || !ngo.city || ngo.city.lat == null || ngo.city.lng == null) {
    throw ApiError.badRequest('Please set your city in your profile to view nearby pickups');
  }

  const pickups = await Pickup.find({ status: PICKUP_STATUS.PENDING })
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  const ngoCityName = ngo.city.name.trim().toLowerCase();

  const withDistance = pickups.map((pickup) => {
    const sameCity = pickup.city.trim().toLowerCase() === ngoCityName;
    const distance = distanceKm(ngo.city.lat, ngo.city.lng, pickup.lat, pickup.lng);
    delete pickup.__v;
    return { ...pickup, sameCity, distanceKm: Math.round(distance * 10) / 10 };
  });

  withDistance.sort((a, b) => {
    if (a.sameCity !== b.sameCity) return a.sameCity ? -1 : 1;
    return a.distanceKm - b.distanceKm;
  });

  return withDistance;
};

const getAcceptedPickups = async (ngoId) => {
  const pickups = await Pickup.find({ ngo: ngoId })
    .populate('user', 'name email')
    .sort({ status: 1, pickupDate: 1 })
    .lean();

  pickups.forEach((p) => delete p.__v);
  return pickups;
};

const acceptPickup = async (id, ngoId) => {
  const pickup = await Pickup.findById(id);

  if (!pickup) {
    throw ApiError.notFound('Pickup not found');
  }

  if (pickup.status !== PICKUP_STATUS.PENDING) {
    throw ApiError.conflict('This pickup is no longer available to accept');
  }

  pickup.ngo = ngoId;
  pickup.status = PICKUP_STATUS.IN_PROGRESS;
  pickup.acceptedAt = new Date();
  await pickup.save();

  const ngo = await User.findById(ngoId).lean();

  await notificationService.createNotification({
    recipient: pickup.user,
    sender: ngoId,
    type: NOTIFICATION_TYPE.PICKUP,
    title: 'Your pickup was accepted',
    message: `${ngo?.name || 'An NGO'} accepted your pickup request in ${pickup.city}.`,
    link: '/schedule',
    relatedId: pickup._id
  });

  return pickup;
};

const declinePickup = async (id, ngoId) => {
  const pickup = await Pickup.findById(id);

  if (!pickup) {
    throw ApiError.notFound('Pickup not found');
  }

  if (!pickup.ngo || pickup.ngo.toString() !== ngoId) {
    throw ApiError.forbidden('You are not allowed to decline this pickup');
  }

  if (pickup.status !== PICKUP_STATUS.IN_PROGRESS) {
    throw ApiError.badRequest('Only an accepted pickup can be declined');
  }

  pickup.ngo = null;
  pickup.status = PICKUP_STATUS.PENDING;
  pickup.acceptedAt = null;
  await pickup.save();

  await notificationService.createNotification({
    recipient: pickup.user,
    sender: ngoId,
    type: NOTIFICATION_TYPE.PICKUP,
    title: 'Your pickup is available again',
    message: `The NGO handling your pickup in ${pickup.city} had to back out. It is now open for other NGOs to accept.`,
    link: '/schedule',
    relatedId: pickup._id
  });

  return pickup;
};

const completePickup = async (id, ngoId) => {
  const pickup = await Pickup.findById(id);

  if (!pickup) {
    throw ApiError.notFound('Pickup not found');
  }

  if (!pickup.ngo || pickup.ngo.toString() !== ngoId) {
    throw ApiError.forbidden('You are not allowed to complete this pickup');
  }

  if (pickup.status !== PICKUP_STATUS.IN_PROGRESS) {
    throw ApiError.badRequest('Only an accepted pickup can be marked as complete');
  }

  pickup.status = PICKUP_STATUS.COMPLETED;
  pickup.completedAt = new Date();
  await pickup.save();

  const ngo = await User.findById(ngoId).lean();

  await notificationService.createNotification({
    recipient: pickup.user,
    sender: ngoId,
    type: NOTIFICATION_TYPE.PICKUP,
    title: 'Your pickup is complete',
    message: `${ngo?.name || 'The NGO'} marked your pickup in ${pickup.city} as completed.`,
    link: '/schedule',
    relatedId: pickup._id
  });

  return pickup;
};

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
