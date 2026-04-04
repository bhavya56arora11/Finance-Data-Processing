/**
 * Base error class for all application-level errors.
 *
 * The `isOperational` flag distinguishes expected errors (validation, auth, 404s)
 * from programming errors. The global error handler uses this to decide
 * whether to expose details or return a generic 500.
 */
export class AppError extends Error {
  /**
   * @param {string} message       - Human-readable error description
   * @param {number} statusCode    - HTTP status code
   * @param {string} code          - Machine-readable error code (e.g. 'VALIDATION_ERROR')
   * @param {*}      [details=null] - Optional structured details (field errors, etc.)
   */
  constructor(message, statusCode, code, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
