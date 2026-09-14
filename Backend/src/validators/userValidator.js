const Joi = require('joi');

const FORBIDDEN_FIELDS = ['role', 'email', 'password'];

const updateProfileSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).messages({
    'string.min': 'Name must be at least 2 characters',
    'string.max': 'Name must not exceed 50 characters'
  }),
  skills: Joi.array().items(Joi.string().trim()).optional(),
  bio: Joi.string().trim().max(500).allow('').optional(),
  city: Joi.object({
    name: Joi.string().trim().required(),
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required()
  }).allow(null).optional()
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

const validateUpdateProfile = (data) => {
  const forbidden = FORBIDDEN_FIELDS.filter((field) => field in data);
  if (forbidden.length > 0) {
    const error = new Error('Validation failed');
    error.isJoi = true;
    error.details = forbidden.map((field) => ({
      message: `"${field}" cannot be changed`
    }));
    return { error, value: data };
  }
  return updateProfileSchema.validate(data, { abortEarly: false });
};

module.exports = { validateUpdateProfile };
