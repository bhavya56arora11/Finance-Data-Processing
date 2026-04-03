import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getRolePermissions } from '../constants/roles.js';
import User from '../models/User.js';
import * as auditService from './auditService.js';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
} from '../errors/errorTypes.js';

// ─── Token Helpers ────────────────────────────────────────────────────────────

/**
 * Builds the access token JWT payload.
 * Includes permissions so downstream middleware never needs a DB lookup.
 *
 * @param {object} user - Mongoose User document
 * @returns {string}
 */
function signAccessToken(user) {
  const payload = {
    id:          user._id.toString(),
    role:        user.role,
    permissions: getRolePermissions(user.role),
    department:  user.department ?? null,
    scopedRecords: user.scopedRecords?.map(String) ?? [],
  };

  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtAccessExpires });
}

/**
 * Builds the refresh token JWT payload.
 * Deliberately minimal — only the user ID to limit blast radius if leaked.
 *
 * @param {object} user - Mongoose User document
 * @returns {string}
 */
function signRefreshToken(user) {
  return jwt.sign(
    { id: user._id.toString() },
    env.jwtRefreshSecret,
    { expiresIn: env.jwtRefreshExpires }
  );
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Registers a new user.
 * Self-registrations always receive the `viewer` role.
 * Admins/super_admins can supply any role via the admin user management endpoint instead.
 *
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} [params.role='viewer']
 * @param {string} [params.createdById]  - ID of the admin creating this user, if applicable
 * @param {string} [params.requestId]
 * @returns {Promise<object>} - The created user (plain object, no password)
 */
export async function register({ name, email, password, role = 'viewer', createdById = null, requestId = null }) {
  // Check for duplicate email first to provide a clear error
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new ConflictError('An account with this email address already exists');
  }

  const user = await User.create({
    name,
    email,
    password, // hashed by pre-save hook
    role,
    createdBy: createdById,
  });

  await auditService.log({
    action: 'REGISTER',
    performedBy: user._id,
    targetResource: 'User',
    targetId: user._id,
    requestId,
  });

  // Return a plain object without password — toJSON transform handles _id → id
  return user.toJSON();
}

/**
 * Authenticates a user and issues access + refresh tokens.
 *
 * Security note: We deliberately return the same error message ("Invalid credentials")
 * whether the email or password is wrong, to prevent user enumeration attacks.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @param {string} [params.requestId]
 * @returns {Promise<{ accessToken: string, refreshToken: string, user: object }>}
 */
export async function login({ email, password, ipAddress = null, userAgent = null, requestId = null }) {
  // findByEmail explicitly selects the password field (which is select:false by default)
  const user = await User.findByEmail(email);

  // Unified error for wrong email AND wrong password — prevents enumeration
  if (!user) {
    throw new AuthenticationError('Invalid credentials');
  }

  if (user.status !== 'active') {
    throw new AuthenticationError('Account is not active');
  }

  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) {
    throw new AuthenticationError('Invalid credentials');
  }

  // Issue tokens
  const accessToken  = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  // Update last login timestamp (non-blocking — don't await)
  User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() }).exec().catch((err) => {
    console.error('[AuthService] Failed to update lastLoginAt:', err.message);
  });

  await auditService.log({
    action: 'LOGIN',
    performedBy: user._id,
    targetResource: 'User',
    targetId: user._id,
    changes: { status: user.status },
    ipAddress,
    userAgent,
    requestId,
  });

  const userPayload = {
    id:    user._id.toString(),
    name:  user.name,
    email: user.email,
    role:  user.role,
  };

  return { accessToken, refreshToken, user: userPayload };
}

/**
 * Verifies a refresh token and issues a new access token.
 *
 * Stateless design: refresh tokens are not stored server-side.
 * Trade-off: revocation isn't immediate — see Known Tradeoffs in README.
 *
 * @param {string} refreshToken
 * @returns {Promise<{ accessToken: string }>}
 */
export async function refresh(refreshToken) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, env.jwtRefreshSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AuthenticationError('Refresh token has expired. Please log in again.');
    }
    throw new AuthenticationError('Invalid refresh token');
  }

  // Fetch current user to get up-to-date role/permissions in the new token
  const user = await User.findById(decoded.id);
  if (!user || user.status !== 'active') {
    throw new AuthenticationError('User not found or account is not active');
  }

  const accessToken = signAccessToken(user);
  return { accessToken };
}
