import { ROLES } from '../constants/roles.js';

export function scopeFilter(req, _res, next) {
  const { role, department, scopedRecords } = req.user ?? {};

  let scope;

  switch (role) {
    case ROLES.VIEWER:
      scope = {
        isDeleted: false,
        ...(department ? { department } : {}),
      };
      break;

    case ROLES.EXTERNAL_AUDITOR:
      scope = {
        isDeleted: false,
        _id: { $in: scopedRecords ?? [] },
      };
      break;

    case ROLES.AUDITOR:
      scope = { _includeDeleted: true };
      break;

    default:
      scope = { isDeleted: false };
  }

  req.queryScope = scope;
  next();
}
