import { AppError } from './AppError.js';

// ─── 400 Bad Request ──────────────────────────────────────────────────────────

/**
 * Thrown when request body fails Zod or Mongoose validation.
 * `details` is an array of { field, message } objects for precise client feedback.
 */
export class ValidationError extends AppError {
  constructor(details) {
    super('Validation failed', 400, 'VALIDATION_ERROR', details);
  }
}

// ─── 401 Unauthorized ─────────────────────────────────────────────────────────

/**
 * Thrown for missing, malformed, or invalid tokens. Also used for wrong credentials.
 * Deliberately keeps messages vague when revealing which field is wrong would be a security risk.
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Distinct from AuthenticationError so the client knows exactly why the 401 occurred.
 * Allows the frontend to trigger a silent refresh instead of a full logout.
 */
export class TokenExpiredError extends AppError {
  constructor() {
    super('Token has expired', 401, 'TOKEN_EXPIRED');
  }
}

// ─── 403 Forbidden ────────────────────────────────────────────────────────────

/**
 * Thrown when the user is authenticated but lacks the required permission.
 * Includes the missing permission in the message for debuggability without leaking internals.
 *
 * @param {string} permission - The permission string that was required
 */
export class AuthorizationError extends AppError {
  constructor(permission) {
    super(
      `You do not have the required permission: ${permission}`,
      403,
      'AUTHORIZATION_ERROR',
      { requiredPermission: permission }
    );
  }
}

/**
 * Thrown when a request attempts to access records outside the user's data scope.
 * Intentionally vague — we don't confirm the record exists to a scoped user.
 */
export class ScopeViolationError extends AppError {
  constructor() {
    super('Access to this resource is outside your permitted scope', 403, 'SCOPE_VIOLATION');
  }
}

/**
 * Thrown for role-level restrictions that go beyond permission checks.
 * E.g., an accountant trying to void a transaction even if they somehow had update:transactions.
 */
export class OperationNotPermittedError extends AppError {
  constructor(message = 'This operation is not permitted') {
    super(message, 403, 'OPERATION_NOT_PERMITTED');
  }
}

// ─── 404 Not Found ────────────────────────────────────────────────────────────

/**
 * @param {string} resource - Human-readable resource name, e.g. 'Transaction', 'User'
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

// ─── 409 Conflict ─────────────────────────────────────────────────────────────

/**
 * Thrown for duplicate key violations (unique email, reference number, etc.).
 */
export class ConflictError extends AppError {
  constructor(message = 'A conflict occurred with existing data') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Thrown when a status-machine transition is invalid.
 * E.g., trying to approve a transaction that is already voided.
 */
export class InvalidStateError extends AppError {
  constructor(message = 'Invalid state transition') {
    super(message, 409, 'INVALID_STATE_TRANSITION');
  }
}

// ─── 429 Too Many Requests ────────────────────────────────────────────────────

export class RateLimitError extends AppError {
  constructor() {
    super('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
  }
}

// ─── 500 Internal Server Error ────────────────────────────────────────────────

/**
 * Wraps unexpected database errors.
 * Never surfaces internal Mongoose/MongoDB error details to the client.
 */
export class DatabaseError extends AppError {
  constructor() {
    super('A database error occurred. Please try again.', 500, 'DATABASE_ERROR');
  }
}
