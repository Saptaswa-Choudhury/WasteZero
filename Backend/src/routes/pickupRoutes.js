const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/roleMiddleware');
const { ROLES } = require('../constants/roles');
const pickupController = require('../controllers/pickupController');

router.use(authMiddleware);

router.post('/', authorize(ROLES.VOLUNTEER), pickupController.createPickup);
router.get('/mine', authorize(ROLES.VOLUNTEER), pickupController.getMyPickups);
router.get('/available', authorize(ROLES.NGO), pickupController.getAvailablePickups);
router.get('/accepted', authorize(ROLES.NGO), pickupController.getAcceptedPickups);
router.get('/:id', pickupController.getPickupById);
router.patch('/:id/cancel', authorize(ROLES.VOLUNTEER, ROLES.ADMIN), pickupController.cancelPickup);
router.patch('/:id/accept', authorize(ROLES.NGO), pickupController.acceptPickup);
router.patch('/:id/decline', authorize(ROLES.NGO), pickupController.declinePickup);
router.patch('/:id/complete', authorize(ROLES.NGO), pickupController.completePickup);

module.exports = router;
