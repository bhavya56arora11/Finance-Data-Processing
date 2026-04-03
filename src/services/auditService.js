import AuditLog from '../models/AuditLog.js';

/**
 * Central audit logging service.
 *
 * All AuditLog.create() calls in the system must go through this service.
 * Controllers and services should never import AuditLog directly.
 *
 * Failures are intentionally non-fatal: we log to stderr but never throw,
 * so an audit logging hiccup cannot disrupt a user-facing operation.
 *
 * @param {object} params
 * @param {string}          params.action           - e.g. 'CREATE_TRANSACTION', 'LOGIN'
 * @param {string}          params.performedBy      - ObjectId of the acting user
 * @param {string}         [params.targetResource]  - Mongoose model name, e.g. 'Transaction'
 * @param {string}         [params.targetId]        - ObjectId of the affected document
 * @param {object}         [params.changes]         - Before/after snapshot
 * @param {string}         [params.ipAddress]
 * @param {string}         [params.userAgent]
 * @param {string}         [params.requestId]
 * @returns {Promise<void>}
 */
export async function log({
  action,
  performedBy,
  targetResource = null,
  targetId = null,
  changes = null,
  ipAddress = null,
  userAgent = null,
  requestId = null,
}) {
  try {
    await AuditLog.create({
      action,
      performedBy,
      targetResource,
      targetId,
      changes,
      ipAddress,
      userAgent,
      requestId,
    });
  } catch (err) {
    // Audit failures should never crash the application.
    // In production, this would send to an error tracking service (e.g. Sentry).
    console.error('[AuditService] Failed to write audit log:', {
      action,
      performedBy,
      error: err.message,
    });
  }
}
