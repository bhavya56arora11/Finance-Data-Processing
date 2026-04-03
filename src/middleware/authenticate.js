import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AuthenticationError, TokenExpiredError } from '../errors/errorTypes.js';

/**
 * Authentication middleware.
 *
 * Extracts and verifies a Bearer JWT from the Authorization header.
 * Attaches the decoded payload to `req.user` for downstream middleware/controllers.
 *
 * Design decision: No DB lookup here by design.
 * The JWT payload includes role and permissions so every request is self-contained.
 * This keeps authentication O(1) and stateless — critical for horizontal scalability.
 * Trade-off: role/permission changes in the DB take effect only on next token refresh.
 *
 * @type {import('express').RequestHandler}
 */
export async function authenticate(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.slice(7); // strip "Bearer "

    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new TokenExpiredError();
      }
      throw new AuthenticationError('Invalid token');
    }

    // Attach full decoded payload — includes id, role, permissions, department
    req.user = decoded;
    next();
  } catch (err) {
    next(err);
  }
}
