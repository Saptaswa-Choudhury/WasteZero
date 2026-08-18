const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/roleMiddleware');
const { ROLES } = require('../constants/roles');
const applicationController = require('../controllers/applicationController');

router.use(authMiddleware);

router.post('/', authorize(ROLES.VOLUNTEER), applicationController.joinOpportunity);
router.get('/mine', authorize(ROLES.VOLUNTEER), applicationController.getMyApplications);
router.delete('/opportunity/:opportunityId', authorize(ROLES.VOLUNTEER), applicationController.withdrawApplication);
router.get('/opportunity/:opportunityId', authorize(ROLES.NGO, ROLES.ADMIN), applicationController.getApplicantsForOpportunity);
router.patch('/:id/status', authorize(ROLES.NGO, ROLES.ADMIN), applicationController.updateApplicationStatus);

module.exports = router;
