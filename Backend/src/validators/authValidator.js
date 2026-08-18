const Joi = require('joi');
const { REGISTERABLE_ROLES } = require('../constants/roles');
const { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_REGEX } = require('../constants/security');

const PASSWORD_MESSAGE = `Password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character`;

const passwordSchema = Joi.string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .pattern(PASSWORD_REGEX)
  .required()
  .messages({
    'string.min': PASSWORD_MESSAGE,
    'string.max': PASSWORD_MESSAGE,
    'string.pattern.base': PASSWORD_MESSAGE,
    'string.empty': 'Password is required',
    'any.required': 'Password is required'
  });

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required().messages({
    'string.empty': 'Name is required',
    'string.min': 'Name must be at least 2 characters',
    'string.max': 'Name must not exceed 50 characters'
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email',
    'string.empty': 'Email is required'
  }),
  password: passwordSchema,
  role: Joi.string().valid(...REGISTERABLE_ROLES).required().messages({
    'any.only': 'Role must be one of: ' + REGISTERABLE_ROLES.join(', '),
    'string.empty': 'Role is required'
  }),
  skills: Joi.array().items(Joi.string().trim()).optional(),
  bio: Joi.string().trim().max(500).allow('').optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email',
    'string.empty': 'Email is required'
  }),
  password: Joi.string().required().messages({
    'string.empty': 'Password is required'
  }),
  rememberMe: Joi.boolean().optional()
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    'string.empty': 'Refresh token is required'
  })
});

const verify2faSchema = Joi.object({
  sessionToken: Joi.string().required().messages({
    'string.empty': 'Session token is required'
  }),
  otp: Joi.string().length(6).pattern(/^\d{6}$/).required().messages({
    'string.length': 'OTP must be exactly 6 digits',
    'string.pattern.base': 'OTP must be a 6-digit number',
    'string.empty': 'OTP is required'
  })
});

const resend2faSchema = Joi.object({
  sessionToken: Joi.string().required().messages({
    'string.empty': 'Session token is required'
  })
});

const validateRegister = (data) => registerSchema.validate(data, { abortEarly: false });
const validateLogin = (data) => loginSchema.validate(data, { abortEarly: false });
const validateRefreshToken = (data) => refreshTokenSchema.validate(data, { abortEarly: false });
const validateVerify2fa = (data) => verify2faSchema.validate(data, { abortEarly: false });
const validateResend2fa = (data) => resend2faSchema.validate(data, { abortEarly: false });
const validateRevokeToken = (data) => refreshTokenSchema.validate(data, { abortEarly: false });

module.exports = { validateRegister, validateLogin, validateRefreshToken, validateVerify2fa, validateResend2fa, validateRevokeToken, passwordSchema };
