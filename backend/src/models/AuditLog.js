const mongoose = require('mongoose');

const auditMetadataSchema = new mongoose.Schema(
  {
    attemptedAction: {
      type: String,
      enum: [
        'document.upload',
        'document.read',
        'document.download',
        'document.update',
        'document.delete',
        'permission.grant',
        'permission.revoke',
      ],
    },
    reason: {
      type: String,
      enum: [
        'insufficient_permission',
        'not_document_owner',
        'invalid_target_id',
        'invalid_permission',
        'self_grant',
        'target_user_unavailable',
        'permission_not_found',
        'invalid_credentials',
        'invalid_document_id',
        'document_not_found',
      ],
    },
  },
  { _id: false, strict: 'throw' },
);

const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      immutable: true,
    },
    action: {
      type: String,
      enum: [
        'document.upload',
        'document.download',
        'document.update',
        'document.delete',
        'permission.grant',
        'permission.revoke',
        'document.access.denied',
        'permission.change.denied',
        'auth.login.failed',
        'auth.logout',
        'auth.password_reset.requested',
        'auth.password_reset.completed',
        'auth.password.changed',
        'auth.2fa.enabled',
        'auth.2fa.disabled',
        'auth.admin.bootstrap',
        'auth.user.status',
        'account_status_changed',
      ],
    },
    accountStatus: {
      type: String,
      enum: ['active', 'disabled'],
      default: null,
      immutable: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      default: null,
      immutable: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      immutable: true,
    },
    permissionType: {
      type: String,
      enum: ['read', 'edit'],
      default: null,
      immutable: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
      immutable: true,
    },
    outcome: {
      type: String,
      enum: ['success', 'denied'],
      required: true,
      immutable: true,
    },
    metadata: {
      type: auditMetadataSchema,
      default: () => ({}),
      immutable: true,
    },
  },
  { strict: 'throw', versionKey: false },
);

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ actorUserId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
