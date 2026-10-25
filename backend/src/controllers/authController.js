const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/User');
const TokenRevocation = require('../models/TokenRevocation');
const PasswordResetToken = require('../models/PasswordResetToken');
const { getJwtSecret } = require('../middleware/authenticate');
const { recordAuditEvent } = require('../services/auditLog');
const passwordResetEmail = require('../services/passwordResetEmail');

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

const passwordRounds = 12;
const passwordResetLifetimeMs = 30 * 60 * 1000;
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
      '+passwordHash',
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

    const token = createAccessToken(user, secret);
    return response.status(200).json({ token, user: toPublicUser(user) });
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
  logout,
  me,
  requestPasswordReset,
  requestPasswordResetSchema,
  register,
  registerSchema,
  resetPassword,
  resetPasswordSchema,
};
