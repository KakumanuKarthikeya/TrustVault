const crypto = require('node:crypto');
const request = require('supertest');
const { assertStage4TestDatabase } = require('../../scripts/stage4TestDatabase');

jest.mock('../services/passwordResetEmail', () => ({
  isConfigured: jest.fn(() => false),
  sendPasswordResetEmail: jest.fn(),
}));

const testDatabaseUri = process.env.TRUSTVAULT_TEST_MONGODB_URI;
const databaseName = assertStage4TestDatabase(
  testDatabaseUri,
  process.env.TRUSTVAULT_TEST_DATABASE_CONFIRM,
);
const fixtureRunId = crypto.randomUUID();
const testJwtSecret = crypto.randomBytes(48).toString('base64url');
const testTotpEncryptionKey = crypto.randomBytes(32).toString('base64');
const ownerEmail = `stage4-owner-${fixtureRunId}@integration.test`;
const adminEmail = `stage4-admin-${fixtureRunId}@integration.test`;
const initialPassword = crypto.randomBytes(24).toString('base64url');
const replacementPassword = crypto.randomBytes(24).toString('base64url');
const adminPassword = crypto.randomBytes(24).toString('base64url');
const createdUserIds = [];

process.env.JWT_SECRET = testJwtSecret;
process.env.TOTP_ENCRYPTION_KEY = testTotpEncryptionKey;
process.env.CORS_ORIGINS = 'http://localhost:5173';

let app;
let mongoose;
let User;
let AuditLog;
let Document;
let PasswordResetToken;
let Permission;
let TokenRevocation;
let TwoFactorLoginChallenge;
let ownerId;

async function getUnusedTotpCode(secret, lastUsedStep) {
  const { generate } = await import('otplib');
  let currentStep = Math.floor(Date.now() / 30000);

  while (currentStep <= lastUsedStep) {
    const waitMs = ((lastUsedStep + 1) * 30000) - Date.now() + 50;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    currentStep = Math.floor(Date.now() / 30000);
  }

  return generate({ secret });
}

async function login(email, password) {
  return request(app).post('/api/auth/login').send({ email, password });
}

beforeAll(async () => {
  if (databaseName !== 'trustvault_stage4_test') {
    throw new Error('Refusing to run against a non-test database');
  }

  mongoose = require('mongoose');
  app = require('../app');
  User = require('../models/User');
  AuditLog = require('../models/AuditLog');
  Document = require('../models/Document');
  PasswordResetToken = require('../models/PasswordResetToken');
  Permission = require('../models/Permission');
  TokenRevocation = require('../models/TokenRevocation');
  TwoFactorLoginChallenge = require('../models/TwoFactorLoginChallenge');

  try {
    await require('../config/database').connectDatabase(testDatabaseUri);
  } catch {
    throw new Error(
      'Could not connect to the explicitly verified Stage 4 test database; connection details are withheld',
    );
  }
}, 30000);

afterAll(async () => {
  if (mongoose?.connection.readyState === 1 && createdUserIds.length > 0) {
    const userFilter = { $in: createdUserIds };
    const documentIds = await Document.find({ owner: userFilter }).distinct('_id');

    await Promise.all([
      AuditLog.deleteMany({
        $or: [{ actorUserId: userFilter }, { targetUserId: userFilter }],
      }),
      PasswordResetToken.deleteMany({ userId: userFilter }),
      Permission.deleteMany({
        $or: [{ userId: userFilter }, { documentId: { $in: documentIds } }],
      }),
      TokenRevocation.deleteMany({ userId: userFilter }),
      TwoFactorLoginChallenge.deleteMany({ userId: userFilter }),
      Document.deleteMany({ owner: userFilter }),
    ]);
    await User.deleteMany({ _id: userFilter });
  }

  if (mongoose?.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

describe('Stage 4 MongoDB-backed API integration', () => {
  test('persists signup, authenticates, enforces roles, changes password, and completes 2FA login', async () => {
    const signup = await request(app).post('/api/auth/register').send({
      name: 'Stage Four Owner',
      email: ownerEmail,
      password: initialPassword,
    });
    expect(signup.status).toBe(201);
    expect(signup.body.user.email).toBe(ownerEmail);
    expect(signup.body.user.role).toBe('owner');
    expect(signup.body.user.passwordHash).toBeUndefined();
    expect(typeof signup.body.token === 'string').toBe(true);

    ownerId = signup.body.user.id;
    createdUserIds.push(ownerId);
    const persistedOwner = await User.findById(ownerId).select('+passwordHash');
    expect(persistedOwner).not.toBeNull();
    expect(persistedOwner.passwordHash !== initialPassword).toBe(true);

    const duplicateSignup = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Duplicate', email: ownerEmail, password: initialPassword });
    expect(duplicateSignup.status).toBe(409);

    const invalidLogin = await login(ownerEmail, `${initialPassword}wrong`);
    expect(invalidLogin.status).toBe(401);

    const successfulLogin = await login(ownerEmail, initialPassword);
    expect(successfulLogin.status).toBe(200);
    const ownerToken = successfulLogin.body.token;
    const authorization = `Bearer ${ownerToken}`;

    const protectedResponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authorization);
    expect(protectedResponse.status).toBe(200);
    expect(protectedResponse.body.user.id).toBe(ownerId);

    const deniedAdminAccess = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', authorization);
    expect(deniedAdminAccess.status).toBe(403);

    const passwordChange = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', authorization)
      .send({
        currentPassword: initialPassword,
        newPassword: replacementPassword,
      });
    expect(passwordChange.status).toBe(200);

    const oldTokenAccess = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authorization);
    expect(oldTokenAccess.status).toBe(401);

    const oldPasswordLogin = await login(ownerEmail, initialPassword);
    expect(oldPasswordLogin.status).toBe(401);
    const replacementLogin = await login(ownerEmail, replacementPassword);
    expect(replacementLogin.status).toBe(200);
    let currentToken = replacementLogin.body.token;

    const setup = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${currentToken}`);
    expect(setup.status).toBe(200);
    expect(/^otpauth:\/\/totp\//.test(setup.body.otpauthUri)).toBe(true);
    const totpSecret = new URL(setup.body.otpauthUri).searchParams.get('secret');
    expect(totpSecret).toBeTruthy();

    const wrongSetupCode = await request(app)
      .post('/api/auth/2fa/verify-setup')
      .set('Authorization', `Bearer ${currentToken}`)
      .send({ code: '000000' });
    expect(wrongSetupCode.status).toBe(401);

    const setupCode = await getUnusedTotpCode(totpSecret, -1);
    const verifiedSetup = await request(app)
      .post('/api/auth/2fa/verify-setup')
      .set('Authorization', `Bearer ${currentToken}`)
      .send({ code: setupCode });
    expect(verifiedSetup.status).toBe(200);
    expect(verifiedSetup.body).toEqual({ enabled: true });

    const activeUser = await User.findById(ownerId)
      .select('+twoFactorSecretEncrypted +twoFactorLastUsedStep');
    expect(activeUser.twoFactorEnabled).toBe(true);
    expect(activeUser.twoFactorSecretEncrypted.includes(totpSecret)).toBe(false);

    const twoFactorLogin = await login(ownerEmail, replacementPassword);
    expect(twoFactorLogin.status).toBe(202);
    expect(twoFactorLogin.body.requiresTwoFactor).toBe(true);
    expect(twoFactorLogin.body.token).toBeUndefined();

    const challengeToken = twoFactorLogin.body.challengeToken;
    const challengeDenied = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${challengeToken}`);
    expect(challengeDenied.status).toBe(401);

    const wrongLoginCode = await request(app)
      .post('/api/auth/login/verify-2fa')
      .send({ challengeToken, code: '000000' });
    expect(wrongLoginCode.status).toBe(401);

    const loginCode = await getUnusedTotpCode(
      totpSecret,
      activeUser.twoFactorLastUsedStep,
    );
    const verifiedLogin = await request(app)
      .post('/api/auth/login/verify-2fa')
      .send({ challengeToken, code: loginCode });
    expect(verifiedLogin.status).toBe(200);
    expect(typeof verifiedLogin.body.token === 'string').toBe(true);
    currentToken = verifiedLogin.body.token;

    const disabledTwoFactor = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${currentToken}`)
      .send({
        currentPassword: replacementPassword,
        code: await getUnusedTotpCode(
          totpSecret,
          (await User.findById(ownerId).select('+twoFactorLastUsedStep'))
            .twoFactorLastUsedStep,
        ),
      });
    expect(disabledTwoFactor.status).toBe(200);
    expect(disabledTwoFactor.body.enabled).toBe(false);
    expect(typeof disabledTwoFactor.body.token === 'string').toBe(true);

    const adminPasswordHash = await require('bcrypt').hash(adminPassword, 12);
    const adminFixture = await User.create({
      name: 'Stage Four Admin',
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: 'admin',
    });
    createdUserIds.push(adminFixture._id);

    const adminLogin = await login(adminEmail, adminPassword);
    expect(adminLogin.status).toBe(200);
    const allowedAdminAccess = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminLogin.body.token}`);
    expect(allowedAdminAccess.status).toBe(200);

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${disabledTwoFactor.body.token}`);
    expect(logout.status).toBe(204);
    const revokedTokenAccess = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${disabledTwoFactor.body.token}`);
    expect(revokedTokenAccess.status).toBe(401);

    const storedOwner = await User.findById(ownerId);
    expect(storedOwner.passwordVersion).toBeGreaterThan(0);
    expect(storedOwner.twoFactorEnabled).toBe(false);
  }, 120000);
});
