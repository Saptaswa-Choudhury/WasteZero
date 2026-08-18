const mongoose = require('mongoose');
const { APPLICATION_STATUS_ARRAY, APPLICATION_STATUS } = require('../constants/applicationStatus');

const applicationSchema = new mongoose.Schema(
  {
    opportunity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Opportunity',
      required: [true, 'Opportunity reference is required']
    },
    volunteer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Volunteer reference is required']
    },
    status: {
      type: String,
      enum: {
        values: APPLICATION_STATUS_ARRAY,
        message: 'Status must be one of: ' + APPLICATION_STATUS_ARRAY.join(', ')
      },
      default: APPLICATION_STATUS.PENDING
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewedAt: {
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

applicationSchema.index({ opportunity: 1, volunteer: 1 }, { unique: true });
applicationSchema.index({ volunteer: 1 });
applicationSchema.index({ opportunity: 1 });
applicationSchema.index({ status: 1 });

module.exports = mongoose.model('Application', applicationSchema);
