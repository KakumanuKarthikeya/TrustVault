const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    passwordVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecretEncrypted: {
      type: String,
      select: false,
    },
    twoFactorPendingSecretEncrypted: {
      type: String,
      select: false,
    },
    twoFactorPendingExpiresAt: {
      type: Date,
      select: false,
    },
    twoFactorSetupAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    twoFactorLastUsedStep: {
      type: Number,
      default: -1,
      select: false,
    },
    twoFactorLockedUntil: {
      type: Date,
      select: false,
    },
    role: {
      type: String,
      enum: ['admin', 'owner', 'viewer'],
      default: 'owner',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'disabled'],
      default: 'active',
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('User', userSchema);
