import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { getRolePermissions } from '../constants/roles.js';
import User from '../models/User.js';
import * as auditService from './auditService.js';
import { AuthenticationError, ConflictError } from '../errors/errorTypes.js';

// Token Helpers 

function signAccessToken(user) {
  const payload = {
    id: user._id.toString(),
    role: user.role,
    permissions: getRolePermissions(user.role),
    department: user.department ?? null,
    scopedRecords: user.scopedRecords?.map(String) ?? [],
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtAccessExpires });
}

function signRefreshToken(user) {
  return jwt.sign({ id: user._id.toString() }, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpires });
}

// Register 

export async function register({ name, email, password, role = 'viewer', createdById = null, requestId = null }) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new ConflictError('An account with this email address already exists');

  const user = await User.create({ name, email, password, role, createdBy: createdById });

  await auditService.log({
    action: 'REGISTER', performedBy: user._id,
    targetResource: 'User', targetId: user._id, requestId,
  });

  return user.toJSON();
}

// Login 

export async function login({ email, password, ipAddress = null, userAgent = null, requestId = null }) {
  const user = await User.findByEmail(email);

  if (!user) throw new AuthenticationError('Invalid credentials');
  if (user.status !== 'active') throw new AuthenticationError('Account is not active');

  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) throw new AuthenticationError('Invalid credentials');

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  // Store hashed refresh token for rotation detection
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  User.findByIdAndUpdate(user._id, { lastLoginAt: new Date(), refreshTokenHash }).exec().catch((err) => {
    console.error('[AuthService] Failed to update login metadata:', err.message);
  });

  await auditService.log({
    action: 'LOGIN', performedBy: user._id,
    targetResource: 'User', targetId: user._id,
    changes: { status: user.status }, ipAddress, userAgent, requestId,
  });

  return {
    accessToken, refreshToken,
    user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role },
  };
}

// Refresh (with token rotation) 

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

  const user = await User.findById(decoded.id).select('+refreshTokenHash');
  if (!user || user.status !== 'active') {
    throw new AuthenticationError('User not found or account is not active');
  }

  // Rotation check: verify the presented token matches the stored hash
  if (user.refreshTokenHash) {
    const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isValid) {
      // Token reuse detected — invalidate all sessions for this user
      User.findByIdAndUpdate(user._id, { refreshTokenHash: null }).exec().catch(() => { });
      throw new AuthenticationError('Token reuse detected. Please log in again.');
    }
  }

  // Issue new token pair (rotation)
  const newAccessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user);

  // Store the new hash
  const newHash = await bcrypt.hash(newRefreshToken, 10);
  User.findByIdAndUpdate(user._id, { refreshTokenHash: newHash }).exec().catch((err) => {
    console.error('[AuthService] Failed to update refreshTokenHash:', err.message);
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

// Logout 

export async function logout(userId) {
  if (userId) {
    User.findByIdAndUpdate(userId, { refreshTokenHash: null }).exec().catch(() => { });
  }
}

// Get Current User 

export async function getMe(userId) {
  const user = await User.findById(userId);
  if (!user) throw new AuthenticationError('User not found');
  return user.toJSON();
}
