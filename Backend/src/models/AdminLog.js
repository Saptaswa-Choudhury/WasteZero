const mongoose = require('mongoose');
const { ADMIN_ACTIONS_ARRAY } = require('../constants/adminActions');
const { TARGET_TYPES_ARRAY } = require('../constants/targetTypes');

const adminLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Admin reference is required']
    },
    action: {
      type: String,
      required: [true, 'Action is required'],
      enum: {
        values: ADMIN_ACTIONS_ARRAY,
        message: 'Action must be one of: ' + ADMIN_ACTIONS_ARRAY.join(', ')
      }
    },
    targetType: {
      type: String,
      required: [true, 'Target type is required'],
      enum: {
        values: TARGET_TYPES_ARRAY,
        message: 'Target type must be one of: ' + TARGET_TYPES_ARRAY.join(', ')
      }
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Target ID is required']
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String,
      trim: true,
      default: null
    },
    userAgent: {
      type: String,
      trim: true,
      default: null
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (doc, ret) => {
        delete ret.__v;
        return ret;
      }
    }
  }
);

adminLogSchema.index({ admin: 1, createdAt: -1 });
adminLogSchema.index({ targetType: 1, targetId: 1 });
adminLogSchema.index({ action: 1 });
adminLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdminLog', adminLogSchema);
