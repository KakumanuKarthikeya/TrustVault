const mongoose = require('mongoose');
const { z } = require('zod');
const AuditLog = require('../models/AuditLog');
const Document = require('../models/Document');
const User = require('../models/User');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const statusSchema = z
  .object({ status: z.enum(['active', 'disabled']) })
  .strict();
const auditFields =
  'actorUserId action documentId targetUserId permissionType timestamp outcome metadata';

function parsePositiveInteger(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function dashboard(_request, response, next) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    const [totalUsers, activeUsers, totalDocuments, recentAuditEvents, auditEvents] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ status: 'active' }),
        Document.countDocuments(),
        AuditLog.countDocuments({ timestamp: { $gte: since } }),
        AuditLog.find({ timestamp: { $gte: since } })
          .sort({ timestamp: -1, _id: -1 })
          .limit(5)
          .select(auditFields)
          .lean(),
      ]);

    return response.status(200).json({
      summary: { totalUsers, activeUsers, totalDocuments, recentAuditEvents },
      auditEvents,
    });
  } catch (error) {
    return next(error);
  }
}

async function listUsers(request, response, next) {
  const requestedPage =
    request.query.page === undefined ? 1 : parsePositiveInteger(request.query.page);
  const requestedLimit =
    request.query.limit === undefined
      ? DEFAULT_LIMIT
      : parsePositiveInteger(request.query.limit);
  if (requestedPage === null || requestedLimit === null) {
    return response.status(400).json({ error: 'Invalid user pagination' });
  }

  const limit = Math.min(requestedLimit, MAX_LIMIT);
  const page = Math.min(
    requestedPage,
    Math.floor(Number.MAX_SAFE_INTEGER / limit),
  );
  const skip = (page - 1) * limit;

  try {
    const [total, users] = await Promise.all([
      User.countDocuments(),
      User.find()
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id name email role status createdAt')
        .lean(),
    ]);

    return response.status(200).json({
      users: users.map((user) => ({
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateUserStatus(request, response, next) {
  if (!mongoose.isValidObjectId(request.params.userId)) {
    return response.status(400).json({ error: 'Invalid user ID' });
  }
  const input = statusSchema.safeParse(request.body);
  if (!input.success) {
    return response.status(400).json({ error: 'Invalid account status' });
  }
  if (String(request.params.userId) === String(request.user._id)) {
    return response.status(400).json({ error: 'You cannot change your own account status' });
  }

  try {
    const target = await User.findById(request.params.userId);
    if (!target) {
      return response.status(404).json({ error: 'User not found' });
    }

    if (target.role === 'admin') {
      return response.status(403).json({ error: 'Administrator accounts cannot be changed here' });
    }

    if (target.status === input.data.status) {
      return response.status(200).json({
        user: {
          id: String(target._id),
          name: target.name,
          email: target.email,
          role: target.role,
          status: target.status,
        },
      });
    }

    target.status = input.data.status;
    await target.save();
    await AuditLog.create({
      actorUserId: request.user._id,
      action: 'auth.user.status',
      targetUserId: target._id,
      outcome: 'success',
      metadata: { accountStatus: input.data.status },
    });

    return response.status(200).json({
      user: {
        id: String(target._id),
        name: target.name,
        email: target.email,
        role: target.role,
        status: target.status,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { dashboard, listUsers, updateUserStatus };
