import { AppError } from './AppError.js';

// 400 Bad Request 
export class ValidationError extends AppError {
  constructor(details) {
    super('Validation failed', 400, 'VALIDATION_ERROR', details);
  }
}

// 401 Unauthorized 

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class TokenExpiredError extends AppError {
  constructor() {
    super('Token has expired', 401, 'TOKEN_EXPIRED');
  }
}

// 403 Forbidden 
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

export class ScopeViolationError extends AppError {
  constructor() {
    super('Access to this resource is outside your permitted scope', 403, 'SCOPE_VIOLATION');
  }
}

export class OperationNotPermittedError extends AppError {
  constructor(message = 'This operation is not permitted') {
    super(message, 403, 'OPERATION_NOT_PERMITTED');
  }
}

// 404 Not Found 

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

// 409 Conflict 

export class ConflictError extends AppError {
  constructor(message = 'A conflict occurred with existing data') {
    super(message, 409, 'CONFLICT');
  }
}

export class InvalidStateError extends AppError {
  constructor(message = 'Invalid state transition') {
    super(message, 409, 'INVALID_STATE_TRANSITION');
  }
}

// 429 Too Many Requests 

export class RateLimitError extends AppError {
  constructor() {
    super('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
  }
}

// 500 Internal Server Error 

export class DatabaseError extends AppError {
  constructor() {
    super('A database error occurred. Please try again.', 500, 'DATABASE_ERROR');
  }
}
