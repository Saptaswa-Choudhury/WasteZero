const mongoose = require('mongoose');
const { NOTIFICATION_TYPE_ARRAY } = require('../constants/notificationType');

// Notifications are intentionally denormalized (title/message/link are snapshotted
// at creation time) so a notification still reads correctly even if the underlying
// message/opportunity/sender is later edited or removed.
const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient is required']
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    type: {
      type: String,
      enum: {
        values: NOTIFICATION_TYPE_ARRAY,
        message: 'Type must be one of: ' + NOTIFICATION_TYPE_ARRAY.join(', ')
      },
      required: [true, 'Type is required']
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [150, 'Title must not exceed 150 characters']
    },
    message: {
      type: String,
      trim: true,
      maxlength: [300, 'Message must not exceed 300 characters'],
      default: ''
    },
    // Frontend route (e.g. `/messages?user=<id>` or `/opportunities/<id>`) the
    // notification should navigate to when clicked.
    link: {
      type: String,
      default: null
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    isRead: {
      type: Boolean,
      default: false
    },
    readAt: {
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

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
