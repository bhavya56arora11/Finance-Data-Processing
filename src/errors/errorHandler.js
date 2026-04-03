import { AppError } from './AppError.js';
import { env } from '../config/env.js';

/**
 * Extracts a friendly field name from a Mongoose duplicate key error.
 * keyPattern looks like: { email: 1 } → returns 'email'
 *
 * @param {Error} err
 * @returns {string}
 */
function extractDuplicateField(err) {
  const field = Object.keys(err.keyPattern || {})[0];
  return field ?? 'field';
}

/**
 * Maps Mongoose ValidationError field errors to a structured details array.
 *
 * @param {import('mongoose').Error.ValidationError} err
 * @returns {{ field: string, message: string }[]}
 */
function mapMongooseValidationErrors(err) {
  return Object.values(err.errors).map((e) => ({
    field: e.path,
    message: e.message,
  }));
}

/**
 * Global Express error handler. Must be the LAST middleware mounted in app.js.
 *
 * Handles (in priority order):
 *  1. AppError subclasses (operational errors) — use their own statusCode/code
 *  2. Mongoose ValidationError        → 400 VALIDATION_ERROR
 *  3. Mongoose CastError (bad ObjectId) → 400 INVALID_ID
 *  4. Mongoose duplicate key (11000)  → 409 CONFLICT
 *  5. JWT JsonWebTokenError           → 401 AUTHENTICATION_ERROR
 *  6. JWT TokenExpiredError           → 401 TOKEN_EXPIRED
 *  7. Everything else                 → 500 INTERNAL_SERVER_ERROR (no leakage)
 *
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Base response shape
  const response = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      details: null,
      timestamp: new Date().toISOString(),
      requestId: req.id ?? null,
    },
  };

  // ── 1. AppError (all our custom typed errors) ──────────────────────────────
  if (err instanceof AppError) {
    response.error.code = err.code;
    response.error.message = err.message;
    response.error.details = err.details;
    return res.status(err.statusCode).json(response);
  }

  // ── 2. Mongoose ValidationError ────────────────────────────────────────────
  if (err.name === 'ValidationError' && err.errors) {
    response.error.code = 'VALIDATION_ERROR';
    response.error.message = 'Validation failed';
    response.error.details = mapMongooseValidationErrors(err);
    return res.status(400).json(response);
  }

  // ── 3. Mongoose CastError (invalid ObjectId) ───────────────────────────────
  if (err.name === 'CastError') {
    response.error.code = 'INVALID_ID';
    response.error.message = `Invalid value for field: ${err.path}`;
    response.error.details = { field: err.path, value: err.value };
    return res.status(400).json(response);
  }

  // ── 4. MongoDB duplicate key error ────────────────────────────────────────
  if (err.code === 11000) {
    const field = extractDuplicateField(err);
    response.error.code = 'CONFLICT';
    response.error.message = `A record with this ${field} already exists`;
    response.error.details = { field };
    return res.status(409).json(response);
  }

  // ── 5. JWT invalid signature / malformed token ────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    response.error.code = 'AUTHENTICATION_ERROR';
    response.error.message = 'Invalid token';
    return res.status(401).json(response);
  }

  // ── 6. JWT expired ────────────────────────────────────────────────────────
  if (err.name === 'TokenExpiredError') {
    response.error.code = 'TOKEN_EXPIRED';
    response.error.message = 'Token has expired';
    return res.status(401).json(response);
  }

  // ── 7. Unknown / programming errors ───────────────────────────────────────
  // Always log the full error server-side but never expose it to the client.
  console.error('[Unhandled Error]', {
    requestId: req.id,
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
  });

  // In development, include the stack trace in the response for easier debugging.
  if (env.isDev) {
    response.error.message = err.message;
    response.error.details = { stack: err.stack };
  }

  return res.status(500).json(response);
}
