const AuditLog = require('../models/AuditLog');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const AUDIT_ACTIONS = new Set([
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
]);

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

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

  const filter = {};
  if (request.query.action !== undefined) {
    if (
      typeof request.query.action !== 'string' ||
      !AUDIT_ACTIONS.has(request.query.action)
    ) {
      return response.status(400).json({ error: 'Invalid audit history action' });
    }
    filter.action = request.query.action;
  }
  if (request.query.from !== undefined || request.query.to !== undefined) {
    const from = request.query.from === undefined ? null : parseDate(request.query.from);
    const to = request.query.to === undefined ? null : parseDate(request.query.to);
    if (
      (request.query.from !== undefined && !from) ||
      (request.query.to !== undefined && !to) ||
      (from && to && from > to)
    ) {
      return response.status(400).json({ error: 'Invalid audit history date range' });
    }
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = from;
    if (to) {
      const throughEndOfDay = new Date(to);
      throughEndOfDay.setUTCDate(throughEndOfDay.getUTCDate() + 1);
      filter.timestamp.$lt = throughEndOfDay;
    }
  }

  try {
    const entries = await AuditLog.find(filter)
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
