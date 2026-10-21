const mongoose = require('mongoose');

const tokenRevocationSchema = new mongoose.Schema(
  {
    tokenIdHash: {
      type: String,
      required: true,
      immutable: true,
      match: /^[a-f0-9]{64}$/,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      immutable: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

tokenRevocationSchema.index({ tokenIdHash: 1 }, { unique: true });
tokenRevocationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('TokenRevocation', tokenRevocationSchema);
