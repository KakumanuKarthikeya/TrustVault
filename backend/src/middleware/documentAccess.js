const mongoose = require('mongoose');
const Document = require('../models/Document');
const Permission = require('../models/Permission');

const ACCESS_LEVELS = new Set(['read', 'edit']);

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
      response.status(404).json({ error: 'Document not found' });
      return false;
    }

    const query = DocumentModel.findById(documentId);
    const document =
      query && typeof query.select === 'function'
        ? await query.select('+storageKey')
        : await query;
    if (!document) {
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
            // Audit integration point: persist denied document-access attempts when AuditLog is introduced.
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
        // Audit integration point: persist denied owner-only operations when AuditLog is introduced.
        return response.status(403).json({ error: 'Forbidden' });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  }

  return { requireDocumentAccess, requireDocumentOwner };
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
  requireDocumentAccess: documentAccess.requireDocumentAccess,
  requireDocumentOwner: documentAccess.requireDocumentOwner,
};
