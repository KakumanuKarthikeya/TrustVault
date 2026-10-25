jest.mock('../models/User', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../models/TokenRevocation', () => ({
  exists: jest.fn(),
}));

jest.mock('../models/AuditLog', () => ({
  create: jest.fn(),
}));

jest.mock('../models/TwoFactorLoginChallenge', () => ({
  create: jest.fn(),
  deleteOne: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));

jest.mock('../services/totp', () => ({
  createProvisioningSecret: jest.fn(async (label) => {
    const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    return {
      secret,
      uri: `otpauth://totp/TrustVault:${encodeURIComponent(label)}?secret=${secret}&issuer=TrustVault`,
    };
  }),
  verifyCode: jest.fn(async (_secret, code, afterTimeStep = -1) => {
    const timeStep = Math.floor(Date.now() / 30000);
    return code === '123456' && timeStep > afterTimeStep
      ? { valid: true, timeStep, delta: 0 }
      : null;
  }),
}));

const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../models/User');
const TokenRevocation = require('../models/TokenRevocation');
const AuditLog = require('../models/AuditLog');
const TwoFactorLoginChallenge = require('../models/TwoFactorLoginChallenge');
const app = require('../app');
const { encryptSecret } = require('../services/totpCrypto');

const userId = '64b000000000000000000031';
const secret = 'two-factor-test-secret-with-at-least-32-bytes';
const currentPassword = 'CurrentSecurePassword123!';
const encryptionKey = crypto.randomBytes(32).toString('base64');
let user;
let challenges;
let challengeSequence;

function queryFor(value) {
  const query = {
    select: jest.fn(() => query),
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
  return query;
}

function accessToken(version = 0, claims = {}) {
  return jwt.sign({ ver: version, ...claims }, secret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: 'trustvault',
    audience: 'trustvault-api',
    expiresIn: '15m',
    jwtid: crypto.randomBytes(32).toString('hex'),
  });
}

function authorized() {
  return `Bearer ${accessToken(user.passwordVersion || 0)}`;
}

async function totp() { return '123456'; }

async function startLogin() {
  return request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: currentPassword })
    .set('X-Forwarded-For', '198.51.100.31');
}

beforeAll(() => {
  process.env.JWT_SECRET = secret;
  process.env.TOTP_ENCRYPTION_KEY = encryptionKey;
  app.set('trust proxy', 1);
});

afterAll(() => {
  app.set('trust proxy', false);
});

beforeEach(async () => {
  mongoose.connection.readyState = 1;
  user = {
    _id: userId,
    name: 'Taylor User',
    email: 'taylor@example.com',
    role: 'owner',
    status: 'active',
    passwordHash: await bcrypt.hash(currentPassword, 4),
    passwordVersion: 0,
    twoFactorEnabled: false,
    twoFactorLastUsedStep: -1,
    twoFactorSetupAttempts: 0,
  };
  challenges = [];
  challengeSequence = 0;
  jest.clearAllMocks();
  User.findById.mockImplementation(() => queryFor(user));
  User.findOne.mockImplementation(({ email }) => queryFor(email === user.email ? user : null));
  User.findByIdAndUpdate.mockImplementation(async (_id, update) => {
    Object.assign(user, update.$set || {});
    for (const key of Object.keys(update.$unset || {})) delete user[key];
    return user;
  });
  User.findOneAndUpdate.mockImplementation(async (filter, update) => {
    for (const [key, expected] of Object.entries(filter)) {
      if (key === '_id' && String(expected) !== String(user._id)) return null;
      if (key === 'twoFactorEnabled' && typeof expected === 'object' && '$ne' in expected) {
        if (user.twoFactorEnabled === expected.$ne) return null;
      } else if (key === 'twoFactorLastUsedStep' && typeof expected === 'object' && '$lt' in expected) {
        if ((user.twoFactorLastUsedStep ?? -1) >= expected.$lt) return null;
      } else if (key === 'twoFactorPendingExpiresAt' && typeof expected === 'object' && '$gt' in expected) {
        if (!user.twoFactorPendingExpiresAt || user.twoFactorPendingExpiresAt <= expected.$gt) return null;
      } else if (user[key] !== expected) {
        return null;
      }
    }
    Object.assign(user, update.$set || {});
    for (const key of Object.keys(update.$unset || {})) delete user[key];
    if (update.$inc) {
      for (const [key, amount] of Object.entries(update.$inc)) {
        user[key] = (user[key] || 0) + amount;
      }
    }
    return user;
  });
  TokenRevocation.exists.mockResolvedValue(null);
  AuditLog.create.mockResolvedValue({});
  TwoFactorLoginChallenge.create.mockImplementation(async (record) => {
    const challenge = { _id: `challenge-${++challengeSequence}`, attempts: 0, ...record };
    challenges.push(challenge);
    return challenge;
  });
  TwoFactorLoginChallenge.findOne.mockImplementation(async (filter) =>
    challenges.find((challenge) =>
      challenge.userId === filter.userId &&
      challenge.challengeIdHash === filter.challengeIdHash &&
      challenge.expiresAt > filter.expiresAt.$gt,
    ) || null,
  );
  TwoFactorLoginChallenge.updateOne.mockImplementation(async (filter, update) => {
    const challenge = challenges.find((entry) =>
      entry._id === filter._id && entry.attempts < filter.attempts.$lt,
    );
    if (challenge) challenge.attempts += update.$inc.attempts;
    return { modifiedCount: challenge ? 1 : 0 };
  });
  TwoFactorLoginChallenge.deleteOne.mockImplementation(async (filter) => {
    const index = challenges.findIndex((challenge) =>
      challenge._id === filter._id &&
      (!filter.expiresAt || challenge.expiresAt > filter.expiresAt.$gt) &&
      (!filter.attempts || challenge.attempts < filter.attempts.$lt),
    );
    if (index < 0) return { deletedCount: 0 };
    challenges.splice(index, 1);
    return { deletedCount: 1 };
  });
});

describe('TOTP two-factor authentication', () => {
  test('requires an authenticated user for setup and status', async () => {
    const status = await request(app).get('/api/auth/2fa/status');
    const setup = await request(app).post('/api/auth/2fa/setup');
    const verifySetup = await request(app)
      .post('/api/auth/2fa/verify-setup')
      .send({ code: '123456' });
    const disable = await request(app)
      .post('/api/auth/2fa/disable')
      .send({ currentPassword, code: '123456' });

    expect(status.status).toBe(401);
    expect(setup.status).toBe(401);
    expect(verifySetup.status).toBe(401);
    expect(disable.status).toBe(401);
  });

  test('enrolls only after valid code and never returns the secret in status', async () => {
    const setup = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', authorized());
    expect(setup.status).toBe(200);
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    const totpSecret = new URL(setup.body.otpauthUri).searchParams.get('secret');
    const code = await totp();

    const enabled = await request(app)
      .post('/api/auth/2fa/verify-setup')
      .set('Authorization', authorized())
      .send({ code });
    const status = await request(app)
      .get('/api/auth/2fa/status')
      .set('Authorization', authorized());

    expect(enabled.status).toBe(200);
    expect(enabled.body).toEqual({ enabled: true });
    expect(user.twoFactorEnabled).toBe(true);
    expect(user.twoFactorSecretEncrypted).not.toContain(totpSecret);
    expect(status.body).toEqual({
      available: true,
      enabled: true,
      setupInProgress: false,
    });
    expect(JSON.stringify(status.body)).not.toContain(totpSecret);
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'auth.2fa.enabled',
      outcome: 'success',
    }));
  });

  test('does not enable 2FA after an invalid setup code', async () => {
    const setup = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', authorized());
    const response = await request(app)
      .post('/api/auth/2fa/verify-setup')
      .set('Authorization', authorized())
      .send({ code: '000000' });

    expect(setup.status).toBe(200);
    expect(response.status).toBe(401);
    expect(user.twoFactorEnabled).toBe(false);
    expect(user.twoFactorSetupAttempts).toBe(1);
  });

  test('clears pending enrollment after five invalid verification codes', async () => {
    const setup = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', authorized())
      .set('X-Forwarded-For', '203.0.113.40');
    expect(setup.status).toBe(200);

    const responses = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      responses.push(await request(app)
        .post('/api/auth/2fa/verify-setup')
        .set('Authorization', authorized())
        .set('X-Forwarded-For', `203.0.113.${41 + attempt}`)
        .send({ code: '000000' }));
    }

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401]);
    expect(responses[4].body.error).toMatch(/Start two-factor setup again/);
    expect(user.twoFactorPendingSecretEncrypted).toBeUndefined();
    expect(user.twoFactorPendingExpiresAt).toBeUndefined();
    expect(user.twoFactorEnabled).toBe(false);
  });

  test('fails closed if the encryption key is unavailable', async () => {
    const originalKey = process.env.TOTP_ENCRYPTION_KEY;
    delete process.env.TOTP_ENCRYPTION_KEY;
    user.twoFactorEnabled = true;
    try {
      const status = await request(app)
        .get('/api/auth/2fa/status')
        .set('Authorization', authorized());
      const setup = await request(app)
        .post('/api/auth/2fa/setup')
        .set('Authorization', authorized())
        .set('X-Forwarded-For', '203.0.113.50');
      const login = await startLogin();

      expect(status.status).toBe(200);
      expect(status.body.available).toBe(false);
      expect(setup.status).toBe(503);
      expect(login.status).toBe(503);
      expect(login.body).not.toHaveProperty('token');
    } finally {
      process.env.TOTP_ENCRYPTION_KEY = originalKey;
    }
  });

  test('requires the authenticator factor before issuing a full login token and rejects replay', async () => {
    const totpSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    user.twoFactorEnabled = true;
    user.twoFactorSecretEncrypted = encryptSecret(totpSecret);

    const passwordStep = await startLogin();
    expect(passwordStep.status).toBe(202);
    expect(passwordStep.body.requiresTwoFactor).toBe(true);
    expect(passwordStep.body).not.toHaveProperty('token');
    expect(TwoFactorLoginChallenge.create).toHaveBeenCalledTimes(1);

    const challengeAsAccessToken = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${passwordStep.body.challengeToken}`);
    expect(challengeAsAccessToken.status).toBe(401);

    const code = await totp();
    const completed = await request(app)
      .post('/api/auth/login/verify-2fa')
      .set('X-Forwarded-For', '198.51.100.32')
      .send({ challengeToken: passwordStep.body.challengeToken, code });
    expect(completed.status).toBe(200);
    expect(completed.body.token).toEqual(expect.any(String));
    expect(completed.body.user.email).toBe(user.email);

    const replay = await request(app)
      .post('/api/auth/login/verify-2fa')
      .set('X-Forwarded-For', '198.51.100.33')
      .send({ challengeToken: passwordStep.body.challengeToken, code });
    expect(replay.status).toBe(401);

    const secondChallenge = await startLogin();
    const reusedCode = await request(app)
      .post('/api/auth/login/verify-2fa')
      .set('X-Forwarded-For', '198.51.100.34')
      .send({ challengeToken: secondChallenge.body.challengeToken, code });
    expect(reusedCode.status).toBe(401);
  });

  test('rejects invalid TOTP codes and expired challenges', async () => {
    user.twoFactorEnabled = true;
    user.twoFactorSecretEncrypted = encryptSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');
    const login = await startLogin();
    const invalid = await request(app)
      .post('/api/auth/login/verify-2fa')
      .set('X-Forwarded-For', '198.51.100.35')
      .send({ challengeToken: login.body.challengeToken, code: '000000' });
    expect(invalid.status).toBe(401);
    expect(challenges[0].attempts).toBe(1);

    const expired = jwt.sign(
      { purpose: '2fa', ver: user.passwordVersion },
      secret,
      {
        algorithm: 'HS256',
        subject: userId,
        issuer: 'trustvault',
        audience: 'trustvault-api',
        expiresIn: -1,
        jwtid: crypto.randomBytes(32).toString('hex'),
      },
    );
    const expiredResponse = await request(app)
      .post('/api/auth/login/verify-2fa')
      .set('X-Forwarded-For', '198.51.100.36')
      .send({ challengeToken: expired, code: '123456' });
    expect(expiredResponse.status).toBe(401);
  });

  test('requires current password and a valid unused code to disable 2FA', async () => {
    const totpSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    user.twoFactorEnabled = true;
    user.twoFactorSecretEncrypted = encryptSecret(totpSecret);

    const invalidPassword = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', authorized())
      .send({ currentPassword: 'WrongPassword123!', code: await totp() });
    expect(invalidPassword.status).toBe(401);
    expect(user.twoFactorEnabled).toBe(true);

    const code = await totp();
    const disabled = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', authorized())
      .send({ currentPassword, code });

    expect(disabled.status).toBe(200);
    expect(disabled.body.enabled).toBe(false);
    expect(disabled.body.token).toEqual(expect.any(String));
    expect(user.twoFactorEnabled).toBe(false);
    expect(user.twoFactorSecretEncrypted).toBeUndefined();
    expect(user.passwordVersion).toBe(1);
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'auth.2fa.disabled',
      outcome: 'success',
    }));
  });

  test('rate limits second-factor verification attempts', async () => {
    const challengeToken = jwt.sign(
      { purpose: '2fa', ver: 0 },
      secret,
      {
        algorithm: 'HS256',
        subject: userId,
        issuer: 'trustvault',
        audience: 'trustvault-api',
        expiresIn: '5m',
        jwtid: crypto.randomBytes(32).toString('hex'),
      },
    );
    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request(app)
        .post('/api/auth/login/verify-2fa')
        .set('X-Forwarded-For', '198.51.100.99')
        .send({ challengeToken, code: '123456' });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });
});
