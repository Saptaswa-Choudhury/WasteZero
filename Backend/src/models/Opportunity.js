const mongoose = require('mongoose');
const { OPPORTUNITY_STATUS_ARRAY, OPPORTUNITY_STATUS } = require('../constants/opportunityStatus');
const { DURATION_UNITS_ARRAY } = require('../constants/durationUnits');

const opportunitySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [100, 'Title must not exceed 100 characters']
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters'],
      maxlength: [2000, 'Description must not exceed 2000 characters']
    },
    requiredSkills: {
      type: [String],
      set: (skills) => [...new Set(skills.map((s) => s.trim().toLowerCase()).filter(Boolean))],
      default: []
    },
    image: {
      type: String,
      default: null
    },
    imagePublicId: {
      type: String,
      default: null,
      select: false
    },
    location: {
      city: {
        type: String,
        required: [true, 'City is required'],
        trim: true
      },
      state: {
        type: String,
        required: [true, 'State is required'],
        trim: true
      }
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
    duration: {
      value: {
        type: Number,
        required: [true, 'Duration value is required'],
        min: [1, 'Duration must be at least 1']
      },
      unit: {
        type: String,
        required: [true, 'Duration unit is required'],
        enum: {
          values: DURATION_UNITS_ARRAY,
          message: 'Unit must be hours, days, weeks, or months'
        }
      }
    },
    status: {
      type: String,
      enum: {
        values: OPPORTUNITY_STATUS_ARRAY,
        message: 'Status must be one of: ' + OPPORTUNITY_STATUS_ARRAY.join(', ')
      },
      default: OPPORTUNITY_STATUS.OPEN
    },
    maxVolunteers: {
      type: Number,
      default: 0,
      min: [0, 'maxVolunteers cannot be negative']
    },
    applicationDeadline: {
      type: Date,
      default: null
    },
    ngo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'NGO reference is required']
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'CreatedBy reference is required']
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
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

opportunitySchema.index({ title: 'text' });
opportunitySchema.index({ status: 1, 'location.city': 1 });
opportunitySchema.index({ ngo: 1 });
opportunitySchema.index({ createdAt: -1 });
opportunitySchema.index({ status: 1 });

module.exports = mongoose.model('Opportunity', opportunitySchema);
