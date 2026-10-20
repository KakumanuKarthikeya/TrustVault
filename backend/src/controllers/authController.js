const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/User');
const { getJwtSecret } = require('../middleware/authenticate');

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

const passwordRounds = 12;
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

function createAccessToken(userId, secret) {
  return jwt.sign({}, secret, {
    algorithm: 'HS256',
    subject: userId.toString(),
    issuer: 'trustvault',
    audience: 'trustvault-api',
    expiresIn: '15m',
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
    const token = createAccessToken(user._id, secret);

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
      return response.status(401).json({ error: 'Invalid email or password' });
    }

    const token = createAccessToken(user._id, secret);
    return response.status(200).json({ token, user: toPublicUser(user) });
  } catch (error) {
    return next(error);
  }
}

function me(request, response) {
  return response.status(200).json({ user: toPublicUser(request.user) });
}

module.exports = {
  login,
  loginSchema,
  me,
  register,
  registerSchema,
};
