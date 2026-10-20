const VALID_ROLES = new Set(['admin', 'owner', 'viewer']);

function authorizeRoles(...allowedRoles) {
  const allowed = new Set(allowedRoles);

  return (request, response, next) => {
    if (!request.user) {
      return response.status(401).json({ error: 'Authentication required' });
    }

    if (
      request.user.status !== 'active' ||
      !VALID_ROLES.has(request.user.role) ||
      !allowed.has(request.user.role)
    ) {
      return response.status(403).json({ error: 'Forbidden' });
    }

    return next();
  };
}

module.exports = authorizeRoles;
