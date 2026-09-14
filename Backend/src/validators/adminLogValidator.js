const Joi = require('joi');
const { ADMIN_ACTIONS_ARRAY } = require('../constants/adminActions');
const { TARGET_TYPES_ARRAY } = require('../constants/targetTypes');

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const createSchema = Joi.object({
  action: Joi.string()
    .valid(...ADMIN_ACTIONS_ARRAY)
    .required()
    .messages({
      'any.only': 'Action must be one of: ' + ADMIN_ACTIONS_ARRAY.join(', '),
      'string.empty': 'Action is required'
    }),
  targetType: Joi.string()
    .valid(...TARGET_TYPES_ARRAY)
    .required()
    .messages({
      'any.only': 'Target type must be one of: ' + TARGET_TYPES_ARRAY.join(', '),
      'string.empty': 'Target type is required'
    }),
  targetId: Joi.string()
    .pattern(objectIdPattern)
    .required()
    .messages({
      'string.pattern.base': 'Target ID must be a valid ObjectId',
      'string.empty': 'Target ID is required'
    }),
  details: Joi.object()
    .optional()
    .messages({
      'object.base': 'Details must be a valid object'
    }),
  admin: Joi.any().forbidden().messages({
    'any.unknown': 'Admin is set automatically from the authenticated user'
  }),
  ipAddress: Joi.any().forbidden(),
  userAgent: Joi.any().forbidden(),
  createdAt: Joi.any().forbidden(),
  updatedAt: Joi.any().forbidden()
});

const validateCreateAdminLog = (data) => createSchema.validate(data, { abortEarly: false, stripUnknown: true });

module.exports = { validateCreateAdminLog };
