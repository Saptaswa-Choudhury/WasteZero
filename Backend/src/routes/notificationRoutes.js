const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const notificationController = require('../controllers/notificationController');

router.use(authMiddleware);

// Paginated list of the current user's notifications (most recent first),
// also returns the current unread count alongside the page of results.
router.get('/', notificationController.getNotifications);

// Lightweight endpoint just for the badge count, used on app load before the
// full list is needed.
router.get('/unread-count', notificationController.getUnreadCount);

router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
