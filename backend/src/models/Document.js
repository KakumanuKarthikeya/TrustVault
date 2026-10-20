const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
      index: true,
    },
    originalFilename: {
      type: String,
      required: true,
      maxlength: 255,
    },
    storageKey: {
      type: String,
      required: true,
      select: false,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      default: 'general',
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    mimeType: {
      type: String,
      required: true,
      enum: ['application/pdf', 'image/png', 'image/jpeg'],
    },
    size: {
      type: Number,
      required: true,
      min: 1,
      max: 5 * 1024 * 1024,
    },
  },
  { timestamps: true },
);

documentSchema.index({ owner: 1, createdAt: -1 });
documentSchema.index({ name: 1, category: 1 });

module.exports = mongoose.model('Document', documentSchema);
