const mongoose = require('mongoose');

const twoFactorLoginChallengeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    challengeIdHash: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

twoFactorLoginChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model(
  'TwoFactorLoginChallenge',
  twoFactorLoginChallengeSchema,
);
