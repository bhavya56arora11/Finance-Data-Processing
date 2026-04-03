import { AuthenticationError, AuthorizationError } from '../errors/errorTypes.js';

/**
 * Permission-based authorization middleware factory.
 *
 * Usage: router.get('/route', authenticate, requirePermission('read:transactions'), handler)
 *
 * Design: permission checks are data-driven against the JWT payload's permissions array,
 * not role checks. This means future role adjustments in constants/roles.js automatically
 * propagate without changing any middleware or route code.
 *
 * @param {string} permission - A permission string from PERMISSIONS constant
 * @returns {import('express').RequestHandler}
 */
export const requirePermission = (permission) => (req, _res, next) => {
  if (!req.user) {
    return next(new AuthenticationError('Authentication required'));
  }

  const userPermissions = req.user.permissions ?? [];

  if (!userPermissions.includes(permission)) {
    return next(
      new AuthorizationError(permission)
    );
  }

  return next();
};
