import { ROLES } from '../constants/roles.js';

/**
 * Scope filter middleware.
 *
 * Builds and attaches `req.queryScope` to every transaction read request.
 * Services must apply this scope to every transaction query — they should
 * never build their own filter without merging this scope first.
 *
 * Scope rules by role:
 *  - viewer:           sees only their department's non-deleted records
 *  - external_auditor: sees only the specific records assigned to them
 *  - auditor:          sees EVERYTHING including deleted (no isDeleted filter)
 *  - all others:       sees all non-deleted records
 *
 * @type {import('express').RequestHandler}
 */
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
      // Auditors can see deleted records too — no isDeleted filter.
      // The query layer must use _includeDeleted option to bypass the model's
      // pre-find soft-delete hook when this scope is applied.
      scope = { _includeDeleted: true };
      break;

    default:
      scope = { isDeleted: false };
  }

  req.queryScope = scope;
  next();
}
