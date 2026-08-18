const Joi = require('joi');
const { APPLICATION_STATUS_ARRAY } = require('../constants/applicationStatus');

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const createSchema = Joi.object({
  opportunity: Joi.string()
    .pattern(objectIdPattern)
    .required()
    .messages({
      'string.pattern.base': 'Opportunity must be a valid ObjectId',
      'string.empty': 'Opportunity is required'
    }),
  volunteer: Joi.any().forbidden().messages({
    'any.unknown': 'Volunteer is set automatically from the authenticated user'
  }),
  status: Joi.any().forbidden().messages({
    'any.unknown': 'Status is set automatically by the server'
  }),
  updatedBy: Joi.any().forbidden(),
  reviewedBy: Joi.any().forbidden(),
  reviewedAt: Joi.any().forbidden(),
  createdAt: Joi.any().forbidden(),
  updatedAt: Joi.any().forbidden()
});

const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...APPLICATION_STATUS_ARRAY)
    .required()
    .messages({
      'any.only': 'Status must be one of: ' + APPLICATION_STATUS_ARRAY.join(', '),
      'string.empty': 'Status is required'
    }),
  opportunity: Joi.any().forbidden(),
  volunteer: Joi.any().forbidden(),
  updatedBy: Joi.any().forbidden(),
  reviewedBy: Joi.any().forbidden(),
  reviewedAt: Joi.any().forbidden(),
  createdAt: Joi.any().forbidden(),
  updatedAt: Joi.any().forbidden()
});

const validateCreateApplication = (data) => createSchema.validate(data, { abortEarly: false, stripUnknown: true });
const validateUpdateApplicationStatus = (data) => updateStatusSchema.validate(data, { abortEarly: false, stripUnknown: true });

module.exports = { validateCreateApplication, validateUpdateApplicationStatus };
