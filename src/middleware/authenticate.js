import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AuthenticationError, TokenExpiredError } from '../errors/errorTypes.js';

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

    req.user = decoded;
    next();
  } catch (err) {
    next(err);
  }
}