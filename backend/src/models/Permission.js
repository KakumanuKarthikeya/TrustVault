const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    access: {
      type: String,
      enum: ['read', 'edit'],
      required: true,
    },
  },
  { timestamps: true },
);

permissionSchema.index({ documentId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Permission', permissionSchema);
