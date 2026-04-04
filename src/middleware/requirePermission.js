import { AuthenticationError, AuthorizationError } from '../errors/errorTypes.js';

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