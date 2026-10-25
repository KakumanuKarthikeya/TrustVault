const AuditLog = require('../models/AuditLog');

describe('AuditLog schema', () => {
  test('accepts password-reset events without account-identifying status data', async () => {
    const requested = new AuditLog({
      action: 'auth.password_reset.requested',
      outcome: 'success',
    });
    const completed = new AuditLog({
      action: 'auth.password_reset.completed',
      outcome: 'success',
      accountStatus: 'active',
    });

    await requested.validate();
    expect(requested.accountStatus).toBeNull();
    await completed.validate();
  });
});
