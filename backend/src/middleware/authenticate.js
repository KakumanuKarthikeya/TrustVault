const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const TokenRevocation = require('../models/TokenRevocation');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    return null;
  }
  return secret;
}

async function authenticate(request, response, next) {
  const secret = getJwtSecret();
  if (!secret) {
    return response.status(503).json({ error: 'Authentication unavailable' });
  }

  const authorization = request.get('authorization') || '';
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) {
    return response.status(401).json({ error: 'Authentication required' });
  }

  let payload;
  try {
    payload = jwt.verify(match[1], secret, {
      algorithms: ['HS256'],
      issuer: 'trustvault',
      audience: 'trustvault-api',
    });
  } catch (_error) {
    return response.status(401).json({ error: 'Authentication required' });
  }

  if (
    !payload ||
    typeof payload === 'string' ||
    typeof payload.sub !== 'string' ||
    !mongoose.isValidObjectId(payload.sub)
  ) {
    return response.status(401).json({ error: 'Authentication required' });
  }

  if (
    typeof payload.jti !== 'string' ||
    !/^[a-f0-9]{64}$/.test(payload.jti) ||
    !Number.isInteger(payload.exp) ||
    (payload.ver !== undefined &&
      (!Number.isSafeInteger(payload.ver) || payload.ver < 0))
  ) {
    return response.status(401).json({ error: 'Authentication required' });
  }

  try {
    const tokenIdHash = hashTokenId(payload.jti);
    const revoked = await TokenRevocation.exists({
      tokenIdHash,
      expiresAt: { $gt: new Date() },
    });
    if (revoked) {
      return response.status(401).json({ error: 'Authentication required' });
    }

    const user = await User.findById(payload.sub);
    if (
      !user ||
      user.status !== 'active' ||
      (user.passwordVersion || 0) !== (payload.ver || 0)
    ) {
      return response.status(401).json({ error: 'Authentication required' });
    }

    request.user = user;
    request.authToken = {
      tokenIdHash,
      expiresAt: new Date(payload.exp * 1000),
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

function hashTokenId(tokenId) {
  return crypto.createHash('sha256').update(tokenId, 'utf8').digest('hex');
}

module.exports = { authenticate, getJwtSecret, hashTokenId };
