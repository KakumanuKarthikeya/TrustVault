jest.mock('resend', () => ({
  Resend: jest.fn(),
}));

const { Resend } = require('resend');
const { isConfigured, sendPasswordResetEmail } = require('../services/passwordResetEmail');

const environmentKeys = ['RESEND_API_KEY', 'EMAIL_FROM', 'FRONTEND_URL'];
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
);

describe('password reset email service', () => {
  let send;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM = 'TrustVault <no-reply@example.test>';
    process.env.FRONTEND_URL = 'https://trustvault.example.test';
    send = jest.fn().mockResolvedValue({ data: { id: 'email-id' }, error: null });
    Resend.mockImplementation(() => ({ emails: { send } }));
  });

  afterAll(() => {
    environmentKeys.forEach((key) => {
      if (originalEnvironment[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnvironment[key];
      }
    });
  });

  test('is configured only when the required settings are present', () => {
    expect(isConfigured()).toBe(true);
    delete process.env.RESEND_API_KEY;
    expect(isConfigured()).toBe(false);
  });

  test('sends a reset link through the Resend SDK', async () => {
    await sendPasswordResetEmail('user@example.test', 'single-use-reset-token');

    expect(Resend).toHaveBeenCalledWith('re_test_key');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: 'TrustVault <no-reply@example.test>',
      to: 'user@example.test',
      subject: 'Reset your TrustVault password',
      text: expect.stringContaining(
        'https://trustvault.example.test/reset-password?token=single-use-reset-token',
      ),
    }));
  });

  test('rejects provider errors without propagating provider details', async () => {
    send.mockResolvedValue({
      data: null,
      error: { message: 'provider detail containing sensitive diagnostics' },
    });

    await expect(
      sendPasswordResetEmail('user@example.test', 'single-use-reset-token'),
    ).rejects.toThrow(/^Password reset email delivery failed$/);
  });

  test('rejects SDK request failures without propagating provider details', async () => {
    send.mockRejectedValue(new Error('provider detail containing sensitive diagnostics'));

    await expect(
      sendPasswordResetEmail('user@example.test', 'single-use-reset-token'),
    ).rejects.toThrow(/^Password reset email delivery failed$/);
  });

  test('does not send when configuration is missing', async () => {
    delete process.env.EMAIL_FROM;

    await expect(
      sendPasswordResetEmail('user@example.test', 'single-use-reset-token'),
    ).rejects.toThrow('Password reset email is not configured');
    expect(Resend).not.toHaveBeenCalled();
  });
});
