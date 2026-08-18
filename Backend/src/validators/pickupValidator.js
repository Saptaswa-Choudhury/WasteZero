const Joi = require('joi');
const { WASTE_TYPES_ARRAY } = require('../constants/wasteType');
const { TIME_SLOTS_ARRAY } = require('../constants/timeSlot');

const isTodayOrFuture = (value, helpers) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(value);
  date.setHours(0, 0, 0, 0);

  if (date < today) {
    return helpers.error('date.todayOrFuture');
  }

  return value;
};

const createSchema = Joi.object({
  address: Joi.string()
    .trim()
    .min(5)
    .max(200)
    .required()
    .messages({
      'string.empty': 'Address is required',
      'string.min': 'Address must be at least 5 characters',
      'string.max': 'Address must not exceed 200 characters'
    }),
  city: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .required()
    .messages({
      'string.empty': 'City is required',
      'string.min': 'City must be at least 2 characters',
      'string.max': 'City must not exceed 50 characters'
    }),
  lat: Joi.number()
    .min(-90)
    .max(90)
    .required()
    .messages({
      'any.required': 'Please select a city from the suggestions',
      'number.base': 'Please select a city from the suggestions'
    }),
  lng: Joi.number()
    .min(-180)
    .max(180)
    .required()
    .messages({
      'any.required': 'Please select a city from the suggestions',
      'number.base': 'Please select a city from the suggestions'
    }),
  pickupDate: Joi.date()
    .custom(isTodayOrFuture)
    .required()
    .messages({
      'date.base': 'Pickup date must be a valid date',
      'date.todayOrFuture': 'Pickup date cannot be in the past',
      'any.required': 'Pickup date is required'
    }),
  timeSlot: Joi.string()
    .valid(...TIME_SLOTS_ARRAY)
    .required()
    .messages({
      'any.only': 'Please select a valid time slot',
      'string.empty': 'Preferred time slot is required'
    }),
  wasteTypes: Joi.array()
    .items(
      Joi.string()
        .valid(...WASTE_TYPES_ARRAY)
        .messages({ 'any.only': 'Invalid waste type selected' })
    )
    .min(1)
    .unique()
    .required()
    .messages({
      'array.min': 'Select at least one waste type',
      'array.base': 'Select at least one waste type'
    }),
  notes: Joi.string()
    .trim()
    .max(500)
    .allow('')
    .optional()
    .messages({
      'string.max': 'Additional notes must not exceed 500 characters'
    }),
  user: Joi.any().forbidden().messages({
    'any.unknown': 'User is set automatically from the authenticated user'
  }),
  status: Joi.any().forbidden(),
  ngo: Joi.any().forbidden(),
  cancelledAt: Joi.any().forbidden(),
  createdAt: Joi.any().forbidden(),
  updatedAt: Joi.any().forbidden()
});

const validateCreatePickup = (data) => createSchema.validate(data, { abortEarly: false, stripUnknown: true });

module.exports = { validateCreatePickup };
