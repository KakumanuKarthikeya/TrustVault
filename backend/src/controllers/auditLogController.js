const AuditLog = require('../models/AuditLog');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

async function list(request, response, next) {
  let limit = DEFAULT_LIMIT;
  if (request.query.limit !== undefined) {
    if (
      typeof request.query.limit !== 'string' ||
      !/^\d+$/.test(request.query.limit) ||
      Number(request.query.limit) < 1
    ) {
      return response.status(400).json({ error: 'Invalid audit history limit' });
    }
    limit = Math.min(Number(request.query.limit), MAX_LIMIT);
  }

  try {
    const entries = await AuditLog.find()
      .sort({ timestamp: -1, _id: -1 })
      .limit(limit)
      .select(
        'actorUserId action documentId targetUserId permissionType timestamp outcome metadata',
      )
      .lean();

    return response.status(200).json({ auditLogs: entries });
  } catch (error) {
    return next(error);
  }
}

module.exports = { list };
