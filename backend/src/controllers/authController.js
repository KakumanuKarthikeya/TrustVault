const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/User');
const TokenRevocation = require('../models/TokenRevocation');
const PasswordResetToken = require('../models/PasswordResetToken');
const TwoFactorLoginChallenge = require('../models/TwoFactorLoginChallenge');
const { getJwtSecret } = require('../middleware/authenticate');
const { recordAuditEvent } = require('../services/auditLog');
const passwordResetEmail = require('../services/passwordResetEmail');
const totpCrypto = require('../services/totpCrypto');
const totp = require('../services/totp');

const passwordSchema = z
  .string()
  .min(12)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72);

const registerSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    password: passwordSchema,
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    password: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
  })
  .strict();

const requestPasswordResetSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  })
  .strict();

const resetPasswordSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    password: passwordSchema,
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
    newPassword: passwordSchema,
  })
  .strict();

const totpCodeSchema = z.string().regex(/^\d{6}$/);
const verifyTwoFactorLoginSchema = z
  .object({
    challengeToken: z.string().min(1).max(2048),
    code: totpCodeSchema,
  })
  .strict();
const verifyTwoFactorSetupSchema = z
  .object({ code: totpCodeSchema })
  .strict();
const disableTwoFactorSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
    code: totpCodeSchema,
  })
  .strict();

const passwordRounds = 12;
const passwordResetLifetimeMs = 30 * 60 * 1000;
const twoFactorChallengeLifetimeSeconds = 5 * 60;
const twoFactorSetupLifetimeMs = 10 * 60 * 1000;
const twoFactorMaxAttempts = 5;
const dummyPasswordHash = bcrypt.hashSync('not-a-real-user-password', passwordRounds);

function toPublicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function createAccessToken(user, secret) {
  return jwt.sign({ ver: user.passwordVersion || 0 }, secret, {
    algorithm: 'HS256',
    subject: user._id.toString(),
    issuer: 'trustvault',
    audience: 'trustvault-api',
    expiresIn: '15m',
    jwtid: crypto.randomBytes(32).toString('hex'),
  });
}

function createTwoFactorChallenge(user, secret) {
  const challengeId = crypto.randomBytes(32).toString('hex');
  const token = jwt.sign({ purpose: '2fa', ver: user.passwordVersion || 0 }, secret, {
    algorithm: 'HS256',
    subject: user._id.toString(),
    issuer: 'trustvault',
    audience: 'trustvault-api',
    expiresIn: twoFactorChallengeLifetimeSeconds,
    jwtid: challengeId,
  });

  return {
    challengeId,
    token,
    expiresAt: new Date(Date.now() + twoFactorChallengeLifetimeSeconds * 1000),
  };
}

async function verifyTotpCode(secret, code, afterTimeStep = -1) {
  try {
    return await totp.verifyCode(secret, code, afterTimeStep);
  } catch {
    return null;
  }
}

async function register(request, response, next) {
  const secret = getJwtSecret();
  if (!secret) {
    return response.status(503).json({ error: 'Authentication unavailable' });
  }

  const passwordHash = await bcrypt.hash(request.body.password, passwordRounds);

  try {
    const user = await User.create({
      name: request.body.name,
      email: request.body.email,
      passwordHash,
      role: 'owner',
    });
    const token = createAccessToken(user, secret);

    return response.status(201).json({ token, user: toPublicUser(user) });
  } catch (error) {
    if (error && error.code === 11000) {
      return response.status(409).json({ error: 'Email already registered' });
    }
    return next(error);
  }
}

async function login(request, response, next) {
  const secret = getJwtSecret();
  if (!secret) {
    return response.status(503).json({ error: 'Authentication unavailable' });
  }

  try {
    const user = await User.findOne({ email: request.body.email }).select(
      '+passwordHash +twoFactorSecretEncrypted',
    );
    const passwordHash = user ? user.passwordHash : dummyPasswordHash;
    const passwordMatches = await bcrypt.compare(
      request.body.password,
      passwordHash,
    );

    if (!user || user.status !== 'active' || !passwordMatches) {
      await recordAuditEvent({
        action: 'auth.login.failed',
        outcome: 'denied',
        metadata: { reason: 'invalid_credentials' },
      });
      return response.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.twoFactorEnabled) {
      if (!totpCrypto.isConfigured()) {
        return response.status(503).json({ error: 'Two-factor authentication is unavailable' });
      }

      const challenge = createTwoFactorChallenge(user, secret);
      await TwoFactorLoginChallenge.create({
        userId: user._id,
        challengeIdHash: crypto
          .createHash('sha256')
          .update(challenge.challengeId, 'utf8')
          .digest('hex'),
        expiresAt: challenge.expiresAt,
      });
      return response.status(202).json({
        requiresTwoFactor: true,
        challengeToken: challenge.token,
        expiresIn: twoFactorChallengeLifetimeSeconds,
      });
    }

    const token = createAccessToken(user, secret);
    return response.status(200).json({ token, user: toPublicUser(user) });
  } catch (error) {
    return next(error);
  }
}

async function twoFactorStatus(request, response, next) {
    try {
      const user = await User.findById(request.user._id).select(
        '+twoFactorPendingExpiresAt',
      );
      if (!user) {
        return response.status(401).json({ error: 'Authentication required' });
      }

      return response.status(200).json({
        available: totpCrypto.isConfigured(),
        enabled: Boolean(user.twoFactorEnabled),
        setupInProgress: Boolean(
          user.twoFactorPendingExpiresAt &&
          user.twoFactorPendingExpiresAt > new Date(),
        ),
      });
    } catch (error) {
      return next(error);
    }
  }

async function setupTwoFactor(request, response, next) {
    if (!totpCrypto.isConfigured()) {
      return response.status(503).json({
        error: 'Two-factor encryption is not configured on the backend',
      });
    }

    try {
      const user = await User.findById(request.user._id).select('+twoFactorSecretEncrypted');
      if (!user || user.status !== 'active') {
        return response.status(401).json({ error: 'Authentication required' });
      }
      if (user.twoFactorEnabled) {
        return response.status(409).json({ error: 'Two-factor authentication is already enabled' });
      }

      const enrollment = await totp.createProvisioningSecret(user.email);
      const encryptedSecret = totpCrypto.encryptSecret(enrollment.secret);
      await User.findByIdAndUpdate(user._id, {
        $set: {
          twoFactorPendingSecretEncrypted: encryptedSecret,
          twoFactorPendingExpiresAt: new Date(Date.now() + twoFactorSetupLifetimeMs),
          twoFactorSetupAttempts: 0,
        },
      });
      return response.status(200).json({
        otpauthUri: enrollment.uri,
        expiresIn: twoFactorSetupLifetimeMs / 1000,
      });
    } catch (error) {
      return next(error);
    }
  }

async function verifyTwoFactorSetup(request, response, next) {
    try {
      const user = await User.findById(request.user._id).select(
        '+twoFactorPendingSecretEncrypted +twoFactorPendingExpiresAt +twoFactorSetupAttempts',
      );
      const now = new Date();
      if (
        !user ||
        !user.twoFactorPendingSecretEncrypted ||
        !user.twoFactorPendingExpiresAt ||
        user.twoFactorPendingExpiresAt <= now
      ) {
        return response.status(400).json({ error: 'Two-factor setup has expired. Start setup again.' });
      }

      const secret = totpCrypto.decryptSecret(user.twoFactorPendingSecretEncrypted);
      const result = await verifyTotpCode(secret, request.body.code);
      if (!result) {
        const attempts = (user.twoFactorSetupAttempts || 0) + 1;
        const update = attempts >= twoFactorMaxAttempts
          ? {
              $unset: {
                twoFactorPendingSecretEncrypted: 1,
                twoFactorPendingExpiresAt: 1,
              },
              $set: { twoFactorSetupAttempts: 0 },
            }
          : { $inc: { twoFactorSetupAttempts: 1 } };
        await User.findOneAndUpdate(
          {
            _id: user._id,
            twoFactorPendingSecretEncrypted: user.twoFactorPendingSecretEncrypted,
          },
          update,
        );
        return response.status(401).json({
          error: attempts >= twoFactorMaxAttempts
            ? 'Too many invalid codes. Start two-factor setup again.'
            : 'Invalid verification code',
        });
      }

      const enabledUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          twoFactorEnabled: { $ne: true },
          twoFactorPendingSecretEncrypted: user.twoFactorPendingSecretEncrypted,
          twoFactorPendingExpiresAt: { $gt: now },
        },
        {
          $set: {
            twoFactorEnabled: true,
            twoFactorSecretEncrypted: user.twoFactorPendingSecretEncrypted,
            twoFactorLastUsedStep: result.timeStep,
            twoFactorSetupAttempts: 0,
          },
          $unset: {
            twoFactorPendingSecretEncrypted: 1,
            twoFactorPendingExpiresAt: 1,
          },
        },
        { new: true },
      );
      if (!enabledUser) {
        return response.status(409).json({ error: 'Two-factor setup changed. Start setup again.' });
      }

      await recordAuditEvent({
        actorUserId: enabledUser._id,
        action: 'auth.2fa.enabled',
        accountStatus: enabledUser.status,
        outcome: 'success',
      });
      return response.status(200).json({ enabled: true });
    } catch (error) {
      return next(error);
    }
  }

async function disableTwoFactor(request, response, next) {
    try {
      const user = await User.findById(request.user._id).select(
        '+passwordHash +twoFactorSecretEncrypted +twoFactorLastUsedStep',
      );
      if (!user || user.status !== 'active') {
        return response.status(401).json({ error: 'Authentication required' });
      }
      if (!user.twoFactorEnabled || !user.twoFactorSecretEncrypted) {
        return response.status(409).json({ error: 'Two-factor authentication is not enabled' });
      }

      if (!(await bcrypt.compare(request.body.currentPassword, user.passwordHash))) {
        return response.status(401).json({ error: 'Current password is incorrect' });
      }

      const secret = totpCrypto.decryptSecret(user.twoFactorSecretEncrypted);
      const result = await verifyTotpCode(
        secret,
        request.body.code,
        user.twoFactorLastUsedStep ?? -1,
      );
      if (!result) {
        return response.status(401).json({ error: 'Invalid or already-used verification code' });
      }

      const updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          twoFactorEnabled: true,
          twoFactorSecretEncrypted: user.twoFactorSecretEncrypted,
          twoFactorLastUsedStep: { $lt: result.timeStep },
        },
        {
          $set: {
            twoFactorEnabled: false,
            passwordVersion: (user.passwordVersion || 0) + 1,
            twoFactorLastUsedStep: -1,
            twoFactorSetupAttempts: 0,
          },
          $unset: {
            twoFactorSecretEncrypted: 1,
            twoFactorPendingSecretEncrypted: 1,
            twoFactorPendingExpiresAt: 1,
            twoFactorLockedUntil: 1,
          },
        },
        { new: true },
      );
      if (!updatedUser) {
        return response.status(401).json({ error: 'Invalid or already-used verification code' });
      }

      await recordAuditEvent({
        actorUserId: updatedUser._id,
        action: 'auth.2fa.disabled',
        accountStatus: updatedUser.status,
        outcome: 'success',
      });
      return response.status(200).json({
        enabled: false,
        token: createAccessToken(updatedUser, getJwtSecret()),
      });
    } catch (error) {
      return next(error);
    }
  }

async function verifyTwoFactorLogin(request, response, next) {
    const secret = getJwtSecret();
    if (!secret || !totpCrypto.isConfigured()) {
      return response.status(503).json({ error: 'Two-factor authentication is unavailable' });
    }

    let payload;
    try {
      payload = jwt.verify(request.body.challengeToken, secret, {
        algorithms: ['HS256'],
        issuer: 'trustvault',
        audience: 'trustvault-api',
      });
    } catch {
      return response.status(401).json({ error: 'Invalid or expired two-factor challenge' });
    }
    if (
      !payload ||
      typeof payload === 'string' ||
      payload.purpose !== '2fa' ||
      typeof payload.sub !== 'string' ||
      typeof payload.jti !== 'string' ||
      !/^[a-f0-9]{64}$/.test(payload.jti) ||
      !Number.isInteger(payload.exp) ||
      !Number.isSafeInteger(payload.ver) ||
      payload.ver < 0
    ) {
      return response.status(401).json({ error: 'Invalid or expired two-factor challenge' });
    }

    const challengeIdHash = crypto
      .createHash('sha256')
      .update(payload.jti, 'utf8')
      .digest('hex');
    try {
      const challenge = await TwoFactorLoginChallenge.findOne({
        userId: payload.sub,
        challengeIdHash,
        expiresAt: { $gt: new Date() },
      });
      if (!challenge || challenge.attempts >= twoFactorMaxAttempts) {
        return response.status(401).json({ error: 'Invalid or expired two-factor challenge' });
      }

      const user = await User.findById(payload.sub).select(
        '+twoFactorSecretEncrypted +twoFactorLastUsedStep',
      );
      if (
        !user ||
        user.status !== 'active' ||
        !user.twoFactorEnabled ||
        !user.twoFactorSecretEncrypted ||
        (user.passwordVersion || 0) !== payload.ver
      ) {
        await TwoFactorLoginChallenge.deleteOne({ _id: challenge._id });
        return response.status(401).json({ error: 'Invalid or expired two-factor challenge' });
      }

      const totpSecret = totpCrypto.decryptSecret(user.twoFactorSecretEncrypted);
      const result = await verifyTotpCode(
        totpSecret,
        request.body.code,
        user.twoFactorLastUsedStep ?? -1,
      );
      if (!result) {
        await TwoFactorLoginChallenge.updateOne(
          { _id: challenge._id, attempts: { $lt: twoFactorMaxAttempts } },
          { $inc: { attempts: 1 } },
        );
        return response.status(401).json({ error: 'Invalid or already-used verification code' });
      }

      const consumed = await TwoFactorLoginChallenge.deleteOne({
        _id: challenge._id,
        expiresAt: { $gt: new Date() },
        attempts: { $lt: twoFactorMaxAttempts },
      });
      if (consumed.deletedCount !== 1) {
        return response.status(401).json({ error: 'Invalid or expired two-factor challenge' });
      }

      const updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          status: 'active',
          twoFactorEnabled: true,
          twoFactorSecretEncrypted: user.twoFactorSecretEncrypted,
          twoFactorLastUsedStep: { $lt: result.timeStep },
          passwordVersion: payload.ver,
        },
        { $set: { twoFactorLastUsedStep: result.timeStep } },
        { new: true },
      );
      if (!updatedUser) {
        return response.status(401).json({ error: 'Invalid or already-used verification code' });
      }

      return response.status(200).json({
        token: createAccessToken(updatedUser, secret),
        user: toPublicUser(updatedUser),
      });
    } catch (error) {
      return next(error);
    }
}

function me(request, response) {
  return response.status(200).json({ user: toPublicUser(request.user) });
}

async function logout(request, response, next) {
  try {
    await TokenRevocation.create({
      tokenIdHash: request.authToken.tokenIdHash,
      userId: request.user._id,
      expiresAt: request.authToken.expiresAt,
    });
    await recordAuditEvent({
      actorUserId: request.user._id,
      action: 'auth.logout',
      outcome: 'success',
    });
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
}

async function changePassword(request, response, next) {
  try {
    const user = await User.findById(request.user._id).select('+passwordHash');
    if (!user || user.status !== 'active') {
      return response.status(401).json({ error: 'Authentication required' });
    }

    const currentPasswordMatches = await bcrypt.compare(
      request.body.currentPassword,
      user.passwordHash,
    );
    if (!currentPasswordMatches) {
      return response.status(401).json({ error: 'Current password is incorrect' });
    }

    if (await bcrypt.compare(request.body.newPassword, user.passwordHash)) {
      return response.status(400).json({
        error: 'New password must be different from the current password',
      });
    }

    const passwordHash = await bcrypt.hash(request.body.newPassword, passwordRounds);
    const updatedUser = await User.findByIdAndUpdate(
      { _id: user._id, passwordHash: user.passwordHash },
      {
        $set: { passwordHash },
        $inc: { passwordVersion: 1 },
      },
      { new: true, runValidators: true },
    );
    if (!updatedUser) {
      return response.status(409).json({
        error: 'Password changed while this request was being processed. Sign in again.',
      });
    }

    await recordAuditEvent({
      actorUserId: updatedUser._id,
      action: 'auth.password.changed',
      accountStatus: updatedUser.status,
      outcome: 'success',
    });

    return response.status(200).json({
      message: 'Password changed successfully',
      token: createAccessToken(updatedUser, getJwtSecret()),
    });
  } catch (error) {
    return next(error);
  }
}

async function requestPasswordReset(request, response, next) {
  if (!passwordResetEmail.isConfigured()) {
    return response.status(503).json({ error: 'Password reset email is not configured' });
  }

  try {
    const user = await User.findOne({ email: request.body.email });
    if (user && user.status === 'active') {
      const resetToken = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto
        .createHash('sha256')
        .update(resetToken, 'utf8')
        .digest('hex');

      await PasswordResetToken.deleteMany({ userId: user._id });
      await PasswordResetToken.create({
        userId: user._id,
        tokenHash,
        expiresAt: new Date(Date.now() + passwordResetLifetimeMs),
      });

      try {
        await passwordResetEmail.sendPasswordResetEmail(user.email, resetToken);
      } catch (_error) {
        await PasswordResetToken.deleteOne({ tokenHash });
        console.error('Password reset email delivery failed');
      }
    }

    await recordAuditEvent({
      action: 'auth.password_reset.requested',
      accountStatus: null,
      outcome: 'success',
    });
    return response.status(202).json({
      message: 'If an active account exists for that email, a password reset link has been sent.',
    });
  } catch (error) {
    return next(error);
  }
}

async function resetPassword(request, response, next) {
  const tokenHash = crypto
    .createHash('sha256')
    .update(request.body.token, 'utf8')
    .digest('hex');

  try {
    const resetToken = await PasswordResetToken.findOneAndDelete({
      tokenHash,
      expiresAt: { $gt: new Date() },
    });
    if (!resetToken) {
      return response.status(400).json({ error: 'Invalid or expired password reset link' });
    }

    const passwordHash = await bcrypt.hash(request.body.password, passwordRounds);
    const user = await User.findByIdAndUpdate(
      resetToken.userId,
      { $set: { passwordHash }, $inc: { passwordVersion: 1 } },
      { new: true, runValidators: true },
    );
    if (!user) {
      return response.status(400).json({ error: 'Invalid or expired password reset link' });
    }

    await recordAuditEvent({
      actorUserId: user._id,
      action: 'auth.password_reset.completed',
      accountStatus: user.status,
      outcome: 'success',
    });
    return response.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  login,
  loginSchema,
  changePassword,
  changePasswordSchema,
  logout,
  me,
  requestPasswordReset,
  requestPasswordResetSchema,
  register,
  registerSchema,
  resetPassword,
  resetPasswordSchema,
  setupTwoFactor,
  twoFactorStatus,
  verifyTwoFactorLogin,
  verifyTwoFactorLoginSchema,
  verifyTwoFactorSetup,
  verifyTwoFactorSetupSchema,
  disableTwoFactor,
  disableTwoFactorSchema,
};
