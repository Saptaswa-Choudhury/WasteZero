const mongoose = require('mongoose');
const { PICKUP_STATUS_ARRAY, PICKUP_STATUS } = require('../constants/pickupStatus');
const { WASTE_TYPES_ARRAY } = require('../constants/wasteType');
const { TIME_SLOTS_ARRAY } = require('../constants/timeSlot');

const pickupSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required']
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      minlength: [5, 'Address must be at least 5 characters'],
      maxlength: [200, 'Address must not exceed 200 characters']
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      minlength: [2, 'City must be at least 2 characters'],
      maxlength: [50, 'City must not exceed 50 characters']
    },
    lat: {
      type: Number,
      required: [true, 'City coordinates are required'],
      min: -90,
      max: 90
    },
    lng: {
      type: Number,
      required: [true, 'City coordinates are required'],
      min: -180,
      max: 180
    },
    pickupDate: {
      type: Date,
      required: [true, 'Pickup date is required']
    },
    timeSlot: {
      type: String,
      required: [true, 'Preferred time slot is required'],
      enum: {
        values: TIME_SLOTS_ARRAY,
        message: 'Time slot must be one of: ' + TIME_SLOTS_ARRAY.join(', ')
      }
    },
    wasteTypes: {
      type: [
        {
          type: String,
          enum: {
            values: WASTE_TYPES_ARRAY,
            message: 'Invalid waste type selected'
          }
        }
      ],
      set: (types) => [...new Set((types || []).map((t) => String(t).trim().toLowerCase()))],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'Select at least one waste type'
      }
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Additional notes must not exceed 500 characters'],
      default: ''
    },
    status: {
      type: String,
      enum: {
        values: PICKUP_STATUS_ARRAY,
        message: 'Status must be one of: ' + PICKUP_STATUS_ARRAY.join(', ')
      },
      default: PICKUP_STATUS.PENDING
    },
    ngo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    acceptedAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    },
    cancelledAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.__v;
        return ret;
      }
    }
  }
);

pickupSchema.index({ user: 1, createdAt: -1 });
pickupSchema.index({ user: 1, status: 1 });
pickupSchema.index({ pickupDate: 1 });
pickupSchema.index({ status: 1 });
pickupSchema.index({ ngo: 1, status: 1 });

module.exports = mongoose.model('Pickup', pickupSchema);
