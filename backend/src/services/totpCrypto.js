const crypto = require('node:crypto');

function getEncryptionKey() {
  const configuredKey = process.env.TOTP_ENCRYPTION_KEY?.trim();
  if (!configuredKey) {
    return null;
  }

  if (/^[a-fA-F0-9]{64}$/.test(configuredKey)) {
    return Buffer.from(configuredKey, 'hex');
  }

  const isCanonicalBase64 =
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      configuredKey,
    );
  if (!isCanonicalBase64) {
    return null;
  }

  const key = Buffer.from(configuredKey, 'base64');
  return key.length === 32 && key.toString('base64') === configuredKey
    ? key
    : null;
}

function isConfigured() {
  return getEncryptionKey() !== null;
}

function encryptSecret(secret) {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('Two-factor encryption is not configured');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

function decryptSecret(encryptedSecret) {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('Two-factor encryption is not configured');
  }

  const [ivValue, tagValue, ciphertextValue, extra] = encryptedSecret.split('.');
  if (!ivValue || !tagValue || !ciphertextValue || extra !== undefined) {
    throw new Error('Stored two-factor secret is invalid');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

module.exports = { decryptSecret, encryptSecret, isConfigured };
