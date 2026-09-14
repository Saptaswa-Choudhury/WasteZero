const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES } = require('../constants/roles');

const checkOwnership = ({
  model,
  ownerField = 'ngo',
  resourceName = 'Resource',
  attachAs = 'entity',
  param = 'id'
} = {}) => {
  return asyncHandler(async (req, res, next) => {
    const doc = await model.findById(req.params[param]);

    if (!doc) {
      return next(ApiError.notFound(`${resourceName} not found`));
    }

    if (doc.isDeleted) {
      return res.status(410).json({
        success: false,
        message: `${resourceName} has been deleted`,
        errors: [`This ${resourceName.toLowerCase()} is no longer available`],
        timestamp: new Date().toISOString()
      });
    }

    if (req.user.role === ROLES.ADMIN) {
      req[attachAs] = doc;
      return next();
    }

    const ownerId = doc[ownerField]?.toString();
    if (ownerId !== req.user.id) {
      return next(ApiError.forbidden(`You are not allowed to modify this ${resourceName.toLowerCase()}`));
    }

    req[attachAs] = doc;
    next();
  });
};

module.exports = checkOwnership;
