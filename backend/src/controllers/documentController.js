const fs = require('node:fs');
const mongoose = require('mongoose');
const { z } = require('zod');
const Document = require('../models/Document');
const Permission = require('../models/Permission');
const User = require('../models/User');
const privateFileStorage = require('../services/privateFileStorage');
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

async function upload(request, response, next) {
  const fileInfo = detectAllowedFile(request.file);
  const metadata = uploadMetadataSchema.safeParse(request.body);
  if (!fileInfo || !metadata.success) {
    return response.status(400).json({ error: 'Invalid document upload' });
  }

  let storageKey;
  try {
    storageKey = await privateFileStorage.storeFile(
      request.file.buffer,
      fileInfo.extension,
    );

    const document = await Document.create({
      owner: request.user._id,
      originalFilename: fileInfo.filename,
      storageKey,
      name: metadata.data.name || fileInfo.filename,
      category: metadata.data.category || 'general',
      description: metadata.data.description || '',
      mimeType: fileInfo.mimeType,
      size: request.file.size,
    });

    // Audit integration point: persist a successful upload event when AuditLog is introduced.
    return response.status(201).json({ document: publicDocument(document) });
  } catch (error) {
    if (storageKey) {
      try {
        await privateFileStorage.removeFile(storageKey);
      } catch (cleanupError) {
        return next(cleanupError);
      }
    }
    return next(error);
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

    // Audit integration point: persist an authorized download event when AuditLog is introduced.
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
    // Audit integration point: persist a successful metadata edit when AuditLog is introduced.
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

    // Audit integration point: persist a successful deletion event when AuditLog is introduced.
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
}

async function grantPermission(request, response, next) {
  if (!mongoose.isValidObjectId(request.params.userId)) {
    return response.status(400).json({ error: 'Invalid user ID' });
  }

  const input = permissionSchema.safeParse(request.body);
  if (!input.success) {
    return response.status(400).json({ error: 'Invalid permission' });
  }

  if (String(request.params.userId) === String(request.user._id)) {
    return response.status(400).json({ error: 'Cannot grant access to yourself' });
  }

  try {
    const targetUser = await User.findById(request.params.userId);
    if (!targetUser || targetUser.status !== 'active') {
      return response.status(404).json({ error: 'User not found' });
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

    // Audit integration point: persist permission grant/change when AuditLog is introduced.
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
    return response.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const result = await Permission.deleteOne({
      documentId: request.document._id,
      userId: request.params.userId,
    });

    if (result.deletedCount === 0) {
      return response.status(404).json({ error: 'Permission not found' });
    }

    // Audit integration point: persist permission revocation when AuditLog is introduced.
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
