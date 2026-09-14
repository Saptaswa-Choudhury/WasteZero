const mongoose = require('mongoose');
const { MESSAGE_TYPE_ARRAY, MESSAGE_TYPE } = require('../constants/messageType');

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender is required']
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Receiver is required']
    },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      default: null
    },
    // End-to-end encryption: the server only ever stores ciphertext. Content
    // is encrypted client-side with a random AES-256-GCM key; that key is in
    // turn wrapped (RSA-OAEP) separately for the sender and the receiver so
    // either party can decrypt their own copy of the conversation without
    // the plaintext or the raw AES key ever reaching the backend/database.
    ciphertext: {
      type: String,
      required: [true, 'Encrypted content is required'],
      maxlength: [20000, 'Encrypted content is too large']
    },
    iv: {
      type: String,
      required: [true, 'Encryption IV is required'],
      maxlength: [64, 'Invalid IV']
    },
    encryptedKeyForSender: {
      type: String,
      required: [true, 'Encrypted key for sender is required'],
      maxlength: [2000, 'Invalid encrypted key']
    },
    encryptedKeyForReceiver: {
      type: String,
      required: [true, 'Encrypted key for receiver is required'],
      maxlength: [2000, 'Invalid encrypted key']
    },
    messageType: {
      type: String,
      enum: {
        values: MESSAGE_TYPE_ARRAY,
        message: 'Message type must be one of: ' + MESSAGE_TYPE_ARRAY.join(', ')
      },
      default: MESSAGE_TYPE.TEXT
    },
    isRead: {
      type: Boolean,
      default: false
    },
    readAt: {
      type: Date,
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

messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, isRead: 1 });
messageSchema.index({ application: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ receiver: 1 });
messageSchema.index({ sender: 1, receiver: 1, application: 1 });

module.exports = mongoose.model('Message', messageSchema);
