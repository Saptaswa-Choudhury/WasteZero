const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { getDashboardStats } = require('../controllers/dashboardController');

router.use(authMiddleware);

router.get('/', getDashboardStats);

module.exports = router;
