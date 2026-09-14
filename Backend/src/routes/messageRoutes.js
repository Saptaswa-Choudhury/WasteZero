const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const messageController = require('../controllers/messageController');

router.use(authMiddleware);

// List every conversation the current user is part of (one row per other user).
router.get('/conversations', messageController.getConversations);

// Full message history with one specific user.
router.get('/:userId', messageController.getConversation);

// Mark every message from :userId to the current user as read.
router.patch('/:userId/read', messageController.markConversationRead);

// REST fallback for sending — primary path is the socket 'message:send' event.
router.post('/', messageController.sendMessage);

module.exports = router;
