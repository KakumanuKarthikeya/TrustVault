const AuditLog = require('../models/AuditLog');

async function recordAuditEvent(event, AuditLogModel = AuditLog) {
  return AuditLogModel.create(event);
}

module.exports = { recordAuditEvent };
