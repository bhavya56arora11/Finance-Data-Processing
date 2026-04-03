/**
 * Utility for building uniform success responses.
 * Ensures all 2xx responses share the same envelope shape as error responses.
 */

/**
 * Sends a structured success response.
 *
 * @param {import('express').Response} res
 * @param {*}      data            - The payload to return (object, array, null)
 * @param {string} [message='']   - Optional human-readable message
 * @param {number} [statusCode=200] - HTTP status code
 */
export function sendSuccess(res, data, message = '', statusCode = 200) {
  const body = {
    success: true,
    data,
  };

  if (message) {
    body.message = message;
  }

  return res.status(statusCode).json(body);
}
