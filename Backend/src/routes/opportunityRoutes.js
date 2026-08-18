const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/roleMiddleware');
const checkOwnership = require('../middlewares/ownershipMiddleware');
const Opportunity = require('../models/Opportunity');
const { ROLES } = require('../constants/roles');
const opportunityController = require('../controllers/opportunityController');

router.use(authMiddleware);

router.get('/', opportunityController.getAllOpportunities);
router.post('/', authorize(ROLES.NGO, ROLES.ADMIN), opportunityController.createOpportunity);
router.get('/:id', opportunityController.getOpportunityById);
router.put('/:id', authorize(ROLES.NGO), checkOwnership({ model: Opportunity, resourceName: 'Opportunity' }), opportunityController.updateOpportunity);
router.patch('/:id/status', authorize(ROLES.NGO, ROLES.ADMIN), checkOwnership({ model: Opportunity, resourceName: 'Opportunity' }), opportunityController.changeOpportunityStatus);
router.delete('/:id', authorize(ROLES.NGO), checkOwnership({ model: Opportunity, resourceName: 'Opportunity' }), opportunityController.deleteOpportunity);

module.exports = router;
