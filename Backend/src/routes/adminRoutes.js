const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/roleMiddleware');
const { ROLES } = require('../constants/roles');
const adminController = require('../controllers/adminController');

router.use(authMiddleware, authorize(ROLES.ADMIN));

router.get('/stats', adminController.getStats);

router.get('/users', adminController.getUsers);
router.patch('/users/:id/suspend', adminController.setUserSuspension);

router.delete('/opportunities/:id', adminController.removeOpportunity);

router.get('/logs', adminController.getLogs);

router.get('/reports/:type', adminController.downloadReport);

module.exports = router;
