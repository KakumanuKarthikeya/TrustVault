const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

  if (!payload || typeof payload === 'string' || typeof payload.sub !== 'string') {
    return response.status(401).json({ error: 'Authentication required' });
  }

  try {
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active') {
      return response.status(401).json({ error: 'Authentication required' });
    }

    request.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { authenticate, getJwtSecret };
