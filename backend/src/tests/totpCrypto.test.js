const crypto = require('node:crypto');
const { decryptSecret, encryptSecret, isConfigured } = require('../services/totpCrypto');

describe('TOTP secret encryption', () => {
  const previousKey = process.env.TOTP_ENCRYPTION_KEY;

  afterEach(() => {
    if (previousKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
    else process.env.TOTP_ENCRYPTION_KEY = previousKey;
  });

  test('accepts and uses a valid 32-byte Base64 key', () => {
    process.env.TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    expect(isConfigured()).toBe(true);

    const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    const encrypted = encryptSecret(secret);

    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  test('accepts a valid 64-character hexadecimal key', () => {
    process.env.TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    expect(isConfigured()).toBe(true);
    expect(decryptSecret(encryptSecret('TOTP secret value'))).toBe(
      'TOTP secret value',
    );
  });

  test('fails closed when key configuration is missing', () => {
    delete process.env.TOTP_ENCRYPTION_KEY;
    expect(isConfigured()).toBe(false);
    expect(() => encryptSecret('secret')).toThrow('Two-factor encryption is not configured');
  });

  test.each([
    ['wrong-length', 'not-a-valid-key'],
    ['malformed Base64', `${crypto.randomBytes(32).toString('base64').slice(0, -1)}!`],
  ])('fails closed for %s configuration', (_description, value) => {
    process.env.TOTP_ENCRYPTION_KEY = value;
    expect(isConfigured()).toBe(false);
    expect(() => encryptSecret('secret')).toThrow('Two-factor encryption is not configured');
  });

  test('rejects ciphertext if it has been modified', () => {
    process.env.TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    const encrypted = encryptSecret('TOTP secret value');
    const [iv, tag, ciphertext] = encrypted.split('.');
    const changedFirstCharacter = ciphertext[0] === 'A' ? 'B' : 'A';
    const altered = `${iv}.${tag}.${changedFirstCharacter}${ciphertext.slice(1)}`;

    expect(() => decryptSecret(altered)).toThrow();
  });
});
