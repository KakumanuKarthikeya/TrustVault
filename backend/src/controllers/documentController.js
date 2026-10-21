const fs = require('node:fs');
const mongoose = require('mongoose');
const { z } = require('zod');
const Document = require('../models/Document');
const Permission = require('../models/Permission');
const User = require('../models/User');
const privateFileStorage = require('../services/privateFileStorage');
const { recordAuditEvent } = require('../services/auditLog');
const { detectAllowedFile } = require('../utils/uploadValidation');

const MAX_RESULTS = 100;
const uploadMetadataSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    category: z.string().trim().min(1).max(50).optional(),
    description: z.string().trim().max(2000).optional(),
  })
  .strict();
const updateMetadataSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    category: z.string().trim().min(1).max(50).optional(),
    description: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const permissionSchema = z
  .object({
    access: z.enum(['read', 'edit']),
  })
  .strict();

function publicDocument(document) {
  return {
    id: String(document._id),
    ownerId: String(document.owner),
    originalFilename: document.originalFilename,
    name: document.name,
    category: document.category,
    description: document.description,
    mimeType: document.mimeType,
    size: document.size,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDate(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function denyPermissionAttempt(
  request,
  response,
  next,
  status,
  error,
  reason,
) {
  try {
    await recordAuditEvent({
      actorUserId: request.user._id,
      action: 'permission.change.denied',
      documentId: request.document._id,
      targetUserId: mongoose.isValidObjectId(request.params.userId)
        ? request.params.userId
        : null,
      permissionType:
        request.body &&
        ['read', 'edit'].includes(request.body.access)
          ? request.body.access
          : null,
      outcome: 'denied',
      metadata: {
        attemptedAction:
          request.method === 'PUT' ? 'permission.grant' : 'permission.revoke',
        reason,
      },
    });
    return response.status(status).json({ error });
  } catch (auditError) {
    return next(auditError);
  }
}

async function upload(request, response, next) {
  const fileInfo = detectAllowedFile(request.file);
  const metadata = uploadMetadataSchema.safeParse(request.body);
  if (!fileInfo || !metadata.success) {
    return response.status(400).json({ error: 'Invalid document upload' });
  }

  let storageKey;
  let document;
  try {
    storageKey = await privateFileStorage.storeFile(
      request.file.buffer,
      fileInfo.extension,
    );

    document = await Document.create({
      owner: request.user._id,
      originalFilename: fileInfo.filename,
      storageKey,
      name: metadata.data.name || fileInfo.filename,
      category: metadata.data.category || 'general',
      description: metadata.data.description || '',
      mimeType: fileInfo.mimeType,
      size: request.file.size,
    });

    await recordAuditEvent({
      actorUserId: request.user._id,
      action: 'document.upload',
      documentId: document._id,
      outcome: 'success',
    });
    return response.status(201).json({ document: publicDocument(document) });
  } catch (error) {
    const cleanupErrors = [];
    if (document) {
      try {
        await document.deleteOne();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (storageKey) {
      try {
        await privateFileStorage.removeFile(storageKey);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    return next(
      cleanupErrors.length > 0
        ? new AggregateError(
            [error, ...cleanupErrors],
            'Document upload failed and cleanup was incomplete',
          )
        : error,
    );
  }
}

async function list(request, response, next) {
  try {
    const filterParts = [];
    const scope = [{ owner: request.user._id }];
    const grants = await Permission.find({
      userId: request.user._id,
      access: { $in: ['read', 'edit'] },
    })
      .select('documentId')
      .lean();
    const permittedDocumentIds = grants.map((grant) => grant.documentId);
    if (permittedDocumentIds.length > 0) {
      scope.push({ _id: { $in: permittedDocumentIds } });
    }
    filterParts.push({ $or: scope });

    if (request.query.name !== undefined) {
      if (
        typeof request.query.name !== 'string' ||
        request.query.name.length > 100
      ) {
        return response.status(400).json({ error: 'Invalid search filters' });
      }
      filterParts.push({
        name: { $regex: escapeRegExp(request.query.name), $options: 'i' },
      });
    }

    if (request.query.category !== undefined) {
      if (
        typeof request.query.category !== 'string' ||
        request.query.category.length > 50
      ) {
        return response.status(400).json({ error: 'Invalid search filters' });
      }
      filterParts.push({ category: request.query.category });
    }

    if (request.query.ownerId !== undefined) {
      if (
        typeof request.query.ownerId !== 'string' ||
        !/^[a-f\d]{24}$/i.test(request.query.ownerId)
      ) {
        return response.status(400).json({ error: 'Invalid search filters' });
      }
      filterParts.push({ owner: request.query.ownerId });
    }

    if (request.query.from !== undefined || request.query.to !== undefined) {
      const from = request.query.from
        ? parseDate(request.query.from)
        : null;
      const to = request.query.to ? parseDate(request.query.to) : null;
      if (
        (request.query.from && !from) ||
        (request.query.to && !to) ||
        (from && to && from > to)
      ) {
        return response.status(400).json({ error: 'Invalid search filters' });
      }
      const dateRange = {};
      if (from) dateRange.$gte = from;
      if (to) dateRange.$lte = to;
      filterParts.push({ createdAt: dateRange });
    }

    const documents = await Document.find({ $and: filterParts })
      .sort({ createdAt: -1 })
      .limit(MAX_RESULTS)
      .lean();

    return response.status(200).json({
      documents: documents.map(publicDocument),
    });
  } catch (error) {
    return next(error);
  }
}

function getMetadata(request, response) {
  return response.status(200).json({
    document: publicDocument(request.document),
  });
}

async function download(request, response, next) {
  try {
    const filePath = await privateFileStorage.getFilePath(
      request.document.storageKey,
    );
    await recordAuditEvent({
      actorUserId: request.user._id,
      action: 'document.download',
      documentId: request.document._id,
      outcome: 'success',
    });
    response.type(request.document.mimeType);
    response.attachment(request.document.originalFilename);
    response.set('Cache-Control', 'private, no-store');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (error) => {
      if (error.code === 'ENOENT' && !response.headersSent) {
        response.status(404).json({ error: 'Document file not found' });
        return;
      }
      if (!response.headersSent) {
        next(error);
        return;
      }
      response.destroy();
    });
    stream.pipe(response);

  } catch (error) {
    if (error.code === 'ENOENT') {
      return response.status(404).json({ error: 'Document file not found' });
    }
    return next(error);
  }
}

async function updateMetadata(request, response, next) {
  const metadata = updateMetadataSchema.safeParse(request.body);
  if (!metadata.success) {
    return response.status(400).json({ error: 'Invalid document metadata' });
  }

  try {
    for (const field of ['name', 'category', 'description']) {
      if (Object.hasOwn(metadata.data, field)) {
        request.document[field] = metadata.data[field];
      }
    }

    await request.document.save();
    await recordAuditEvent({
      actorUserId: request.user._id,
      action: 'document.update',
      documentId: request.document._id,
      outcome: 'success',
    });
    return response.status(200).json({
      document: publicDocument(request.document),
    });
  } catch (error) {
    return next(error);
  }
}

async function remove(request, response, next) {
  try {
    const storageKey = request.document.storageKey;
    await request.document.deleteOne();
    await privateFileStorage.removeFile(storageKey);

    await recordAuditEvent({
      actorUserId: request.user._id,
      action: 'document.delete',
      documentId: request.document._id,
      outcome: 'success',
    });
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
}

async function grantPermission(request, response, next) {
  if (!mongoose.isValidObjectId(request.params.userId)) {
    return denyPermissionAttempt(
      request,
      response,
      next,
      400,
      'Invalid user ID',
      'invalid_target_id',
    );
  }

  const input = permissionSchema.safeParse(request.body);
  if (!input.success) {
    return denyPermissionAttempt(
      request,
      response,
      next,
      400,
      'Invalid permission',
      'invalid_permission',
    );
  }

  if (String(request.params.userId) === String(request.user._id)) {
    return denyPermissionAttempt(
      request,
      response,
      next,
      400,
      'Cannot grant access to yourself',
      'self_grant',
    );
  }

  try {
    const targetUser = await User.findById(request.params.userId);
    if (!targetUser || targetUser.status !== 'active') {
      return denyPermissionAttempt(
        request,
        response,
        next,
        404,
        'User not found',
        'target_user_unavailable',
      );
    }

    const permission = await Permission.findOneAndUpdate(
      {
        documentId: request.document._id,
        userId: targetUser._id,
      },
      { $set: { access: input.data.access } },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    await recordAuditEvent({
      actorUserId: request.user._id,
      action: 'permission.grant',
      documentId: request.document._id,
      targetUserId: targetUser._id,
      permissionType: permission.access,
      outcome: 'success',
    });
    return response.status(200).json({
      permission: {
        documentId: String(permission.documentId),
        userId: String(permission.userId),
        access: permission.access,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function revokePermission(request, response, next) {
  if (!mongoose.isValidObjectId(request.params.userId)) {
    return denyPermissionAttempt(
      request,
      response,
      next,
      400,
      'Invalid user ID',
      'invalid_target_id',
    );
  }

  try {
    const permission = await Permission.findOneAndDelete({
      documentId: request.document._id,
      userId: request.params.userId,
    });

    if (!permission) {
      return denyPermissionAttempt(
        request,
        response,
        next,
        404,
        'Permission not found',
        'permission_not_found',
      );
    }

    await recordAuditEvent({
      actorUserId: request.user._id,
      action: 'permission.revoke',
      documentId: request.document._id,
      targetUserId: request.params.userId,
      permissionType: permission.access,
      outcome: 'success',
    });
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  download,
  grantPermission,
  getMetadata,
  list,
  remove,
  revokePermission,
  updateMetadata,
  upload,
};
