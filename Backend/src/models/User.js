const mongoose = require('mongoose');
const { ROLES_ARRAY } = require('../constants/roles');
const { PASSWORD_MIN_LENGTH } = require('../constants/security');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name must not exceed 50 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`],
      select: false
    },
    role: {
      type: String,
      enum: {
        values: ROLES_ARRAY,
        message: 'Role must be one of: ' + ROLES_ARRAY.join(', ')
      },
      required: [true, 'Role is required']
    },
    skills: {
      type: [String],
      default: []
    },
    city: {
      name: { type: String, trim: true, default: null },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null }
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, 'Bio must not exceed 500 characters'],
      default: ''
    },
    // Admin moderation - suspended users are blocked from logging in but
    // their historical data (pickups, opportunities, messages) is kept intact.
    isSuspended: {
      type: Boolean,
      default: false
    },
    suspendedAt: {
      type: Date,
      default: null
    },
    suspendedReason: {
      type: String,
      trim: true,
      maxlength: [300, 'Suspension reason must not exceed 300 characters'],
      default: ''
    },
    // RSA-OAEP public key (JWK, JSON-stringified) used by other clients to
    // end-to-end encrypt messages addressed to this user. The matching
    // private key never leaves the user's device/browser, so the server can
    // never decrypt message content - it only ever stores/relays ciphertext.
    publicKey: {
      type: String,
      default: null
    },
    // Password-wrapped backup of the E2EE private key, so a second
    // device/browser can recover the SAME key pair instead of generating a
    // new (and therefore history-incompatible) one.
    //
    // Nothing here is useful to the server:
    //  - `ciphertext` is the private key encrypted with a Key Encryption Key
    //    (KEK) that is derived from the user's password via Argon2id.
    //  - `salt` is the Argon2id salt (not secret, just needs to be unique).
    //  - The Argon2id password derivation, the AES-GCM wrap/unwrap of the
    //    private key, and the plaintext password itself NEVER leave the
    //    browser. The server only ever stores/returns the encrypted blob.
    keyBackup: {
      ciphertext: { type: String, default: null }, // base64 AES-GCM ciphertext of the key pair
      iv: { type: String, default: null }, // base64 AES-GCM IV
      salt: { type: String, default: null }, // base64 Argon2id salt
      kdf: {
        algorithm: { type: String, default: 'argon2id' },
        memoryCost: { type: Number, default: null }, // KiB
        timeCost: { type: Number, default: null }, // iterations
        parallelism: { type: Number, default: null },
        hashLength: { type: Number, default: null } // derived key length in bytes
      },
      updatedAt: { type: Date, default: null }
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    emailVerificationOtp: {
      type: String,
      select: false
    },
    emailVerificationOtpExpires: {
      type: Date
    },
    emailVerificationAttempts: {
      type: Number,
      default: 0,
      min: 0
    },
    emailVerificationResendCount: {
      type: Number,
      default: 0,
      min: 0
    },
    emailVerificationLockedUntil: {
      type: Date
    },
    lastOtpSentAt: {
      type: Date
    },
    passwordResetOtp: {
      type: String,
      select: false
    },
    passwordResetOtpExpires: {
      type: Date
    },
    passwordResetAttempts: {
      type: Number,
      default: 0,
      min: 0
    },
    passwordResetResendCount: {
      type: Number,
      default: 0,
      min: 0
    },
    passwordResetLockedUntil: {
      type: Date
    },
    lastPasswordResetAt: {
      type: Date
    },
    loginAttempts: {
      type: Number,
      default: 0,
      min: 0
    },
    loginLockedUntil: {
      type: Date
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    twoFactorOtp: {
      type: String,
      select: false
    },
    twoFactorOtpExpires: {
      type: Date
    },
    twoFactorAttempts: {
      type: Number,
      default: 0,
      min: 0
    },
    twoFactorLockedUntil: {
      type: Date
    },
    lastTwoFactorSentAt: {
      type: Date
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

module.exports = mongoose.model('User', userSchema);
