import { z } from 'zod';
import { ROLES } from '../constants/roles.js';
import * as authService from '../services/authService.js';
import { sendSuccess } from '../utils/responseFormatter.js';
import { ValidationError, AuthenticationError } from '../errors/errorTypes.js';

const registerSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters'),
  email: z.string({ required_error: 'Email is required' }).email('Must be a valid email address').toLowerCase(),
  password: z.string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.enum(Object.values(ROLES)).optional().default(ROLES.VIEWER),
});

const loginSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).email('Must be a valid email address'),
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

function validate(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })));
  }
  return result.data;
}

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   7 * 24 * 60 * 60 * 1000,
  path:     '/auth/refresh',
};

export async function register(req, res, next) {
  try {
    const body = validate(registerSchema, req.body);
    body.role = ROLES.VIEWER; // Self-reg always viewer
    const user = await authService.register({ ...body, requestId: req.id });
    return sendSuccess(res, { user }, 'Account created successfully', 201);
  } catch (err) { return next(err); }
}

export async function login(req, res, next) {
  try {
    const body = validate(loginSchema, req.body);
    const { accessToken, refreshToken, user } = await authService.login({
      email: body.email, password: body.password,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? null, requestId: req.id,
    });
    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
    return sendSuccess(res, { accessToken, user }, 'Login successful');
  } catch (err) { return next(err); }
}

export async function refresh(req, res, next) {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) throw new AuthenticationError('No refresh token found. Please log in.');

    const { accessToken, refreshToken: newRefreshToken } = await authService.refresh(refreshToken);

    // Rotate: set the new refresh token cookie
    res.cookie('refreshToken', newRefreshToken, REFRESH_COOKIE_OPTIONS);
    return sendSuccess(res, { accessToken }, 'Token refreshed successfully');
  } catch (err) { return next(err); }
}

export async function logout(req, res, next) {
  try {
    // Clear stored hash server-side if user is authenticated
    const userId = req.user?.id ?? null;
    await authService.logout(userId);

    res.clearCookie('refreshToken', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', path: '/auth/refresh',
    });
    return sendSuccess(res, null, 'Logged out successfully');
  } catch (err) { return next(err); }
}

// GET /auth/me — returns current user profile
export async function getMe(req, res, next) {
  try {
    const user = await authService.getMe(req.user.id);
    return sendSuccess(res, { user });
  } catch (err) { return next(err); }
}