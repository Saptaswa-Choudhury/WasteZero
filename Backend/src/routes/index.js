const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const opportunityRoutes = require('./opportunityRoutes');
const applicationRoutes = require('./applicationRoutes');
const messageRoutes = require('./messageRoutes');
const pickupRoutes = require('./pickupRoutes');
const notificationRoutes = require('./notificationRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const adminRoutes = require('./adminRoutes');

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/opportunities', opportunityRoutes);
router.use('/applications', applicationRoutes);
router.use('/messages', messageRoutes);
router.use('/pickups', pickupRoutes);
router.use('/notifications', notificationRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
