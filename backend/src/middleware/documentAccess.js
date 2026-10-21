const mongoose = require('mongoose');
const Document = require('../models/Document');
const Permission = require('../models/Permission');
const { recordAuditEvent } = require('../services/auditLog');

const ACCESS_LEVELS = new Set(['read', 'edit']);
const UPLOAD_ROLES = new Set(['admin', 'owner']);

function createDocumentAccess({
  DocumentModel = Document,
  PermissionModel = Permission,
} = {}) {
  async function loadDocument(request, response) {
    if (!request.user || !request.user._id || request.user.status !== 'active') {
      response.status(401).json({ error: 'Authentication required' });
      return false;
    }

    const documentId = request.params.documentId;
    if (
      typeof documentId !== 'string' ||
      !mongoose.isValidObjectId(documentId)
    ) {
      await recordDeniedLookup(request, null, 'invalid_document_id');
      response.status(404).json({ error: 'Document not found' });
      return false;
    }

    const query = DocumentModel.findById(documentId);
    const document =
      query && typeof query.select === 'function'
        ? await query.select('+storageKey')
        : await query;
    if (!document) {
      await recordDeniedLookup(request, null, 'document_not_found');
      response.status(404).json({ error: 'Document not found' });
      return false;
    }

    request.document = document;
    return true;
  }

  async function loadDocumentMiddleware(request, response, next) {
    try {
      const loaded = await loadDocument(request, response);
      if (loaded) {
        return next();
      }
    } catch (error) {
      return next(error);
    }
  }

  function requireDocumentAccess(level = 'read') {
    if (!ACCESS_LEVELS.has(level)) {
      throw new TypeError('Unsupported document access level');
    }

    return [
      loadDocumentMiddleware,
      async (request, response, next) => {
        const documentOwnerId = documentOwnerIdOf(request.document);
        if (documentOwnerId && documentOwnerId === String(request.user._id)) {
          return next();
        }

        const allowedAccess = level === 'read' ? ['read', 'edit'] : ['edit'];

        try {
          const permission = await PermissionModel.exists({
            documentId: request.document._id,
            userId: request.user._id,
            access: { $in: allowedAccess },
          });

          if (!permission) {
            await recordAuditEvent({
              actorUserId: request.user._id,
              action: 'document.access.denied',
              documentId: request.document._id,
              outcome: 'denied',
              metadata: {
                attemptedAction: attemptedDocumentAction(request),
                reason: 'insufficient_permission',
              },
            });
            return response.status(403).json({ error: 'Forbidden' });
          }

          return next();
        } catch (error) {
          return next(error);
        }
      },
    ];
  }

  async function requireDocumentOwner(request, response, next) {
    try {
      const loaded = await loadDocument(request, response);
      if (!loaded) {
        return;
      }

      const documentOwnerId = documentOwnerIdOf(request.document);
      if (!documentOwnerId || documentOwnerId !== String(request.user._id)) {
        const isPermissionChange = request.params.userId !== undefined;
        await recordAuditEvent({
          actorUserId: request.user._id,
          action: isPermissionChange
            ? 'permission.change.denied'
            : 'document.access.denied',
          documentId: request.document._id,
          targetUserId: isPermissionChange && mongoose.isValidObjectId(request.params.userId)
            ? request.params.userId
            : null,
          permissionType:
            isPermissionChange &&
            request.body &&
            ['read', 'edit'].includes(request.body.access)
              ? request.body.access
              : null,
          outcome: 'denied',
          metadata: {
            attemptedAction: isPermissionChange
              ? request.method === 'PUT'
                ? 'permission.grant'
                : 'permission.revoke'
              : 'document.delete',
            reason: 'not_document_owner',
          },
        });
        return response.status(403).json({ error: 'Forbidden' });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  }

  return { requireDocumentAccess, requireDocumentOwner };
}

async function requireDocumentUploadRole(request, response, next) {
  if (!request.user) {
    return response.status(401).json({ error: 'Authentication required' });
  }
  if (
    request.user.status === 'active' &&
    UPLOAD_ROLES.has(request.user.role)
  ) {
    return next();
  }

  try {
    await recordAuditEvent({
      actorUserId: request.user._id,
      action: 'document.access.denied',
      outcome: 'denied',
      metadata: {
        attemptedAction: 'document.upload',
        reason: 'insufficient_permission',
      },
    });
    return response.status(403).json({ error: 'Forbidden' });
  } catch (error) {
    return next(error);
  }
}

async function recordDeniedLookup(request, documentId, reason) {
  const isPermissionChange = request.params.userId !== undefined;
  await recordAuditEvent({
    actorUserId: request.user._id,
    action: isPermissionChange
      ? 'permission.change.denied'
      : 'document.access.denied',
    documentId,
    targetUserId:
      isPermissionChange && mongoose.isValidObjectId(request.params.userId)
        ? request.params.userId
        : null,
    permissionType:
      isPermissionChange &&
      request.body &&
      ['read', 'edit'].includes(request.body.access)
        ? request.body.access
        : null,
    outcome: 'denied',
    metadata: {
      attemptedAction: isPermissionChange
        ? request.method === 'PUT'
          ? 'permission.grant'
          : 'permission.revoke'
        : attemptedDocumentAction(request),
      reason,
    },
  });
}

function attemptedDocumentAction(request) {
  if (request.method === 'GET' && request.path.endsWith('/download')) {
    return 'document.download';
  }
  if (request.method === 'PATCH') {
    return 'document.update';
  }
  if (request.method === 'DELETE') {
    return 'document.delete';
  }
  return 'document.read';
}

function documentOwnerIdOf(document) {
  const owner = document && document.owner;
  if (!owner) {
    return null;
  }

  const ownerId = typeof owner === 'object' && owner._id ? owner._id : owner;
  return String(ownerId);
}

const documentAccess = createDocumentAccess();

module.exports = {
  createDocumentAccess,
  requireDocumentUploadRole,
  requireDocumentAccess: documentAccess.requireDocumentAccess,
  requireDocumentOwner: documentAccess.requireDocumentOwner,
};
