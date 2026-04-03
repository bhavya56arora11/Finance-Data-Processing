import { z } from 'zod';
import { ROLES } from '../constants/roles.js';
import * as authService from '../services/authService.js';
import { sendSuccess } from '../utils/responseFormatter.js';
import { ValidationError } from '../errors/errorTypes.js';

// ─── Validation Schemas ───────────────────────────────────────────────────────

const registerSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters'),

  email: z
    .string({ required_error: 'Email is required' })
    .email('Must be a valid email address')
    .toLowerCase(),

  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),

  // Role is only honored when the request comes from an admin (handled in service)
  // Self-registration silently falls back to viewer
  role: z
    .enum(Object.values(ROLES), {
      errorMap: () => ({ message: `Role must be one of: ${Object.values(ROLES).join(', ')}` }),
    })
    .optional()
    .default(ROLES.VIEWER),
});

const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Must be a valid email address'),

  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
});

// ─── Validation Helper ────────────────────────────────────────────────────────

/**
 * Parses and validates request body against a Zod schema.
 * Throws a ValidationError with structured field-level details on failure.
 *
 * @template T
 * @param {z.ZodSchema<T>} schema
 * @param {unknown} body
 * @returns {T}
 */
function validate(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.errors.map((e) => ({
      field:   e.path.join('.'),
      message: e.message,
    }));
    throw new ValidationError(details);
  }
  return result.data;
}

// ─── Cookie Config ────────────────────────────────────────────────────────────

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,      // Not accessible via JS — mitigates XSS
  secure:   process.env.NODE_ENV === 'production', // HTTPS only in prod
  sameSite: 'strict',  // CSRF mitigation
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  path:     '/auth/refresh',          // Scoped to only the refresh endpoint
};

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /auth/register
 *
 * Self-registration always assigns the viewer role regardless of what is sent.
 * Admins use the /users POST endpoint to create users with elevated roles.
 */
export async function register(req, res, next) {
  try {
    const body = validate(registerSchema, req.body);

    // Force viewer role for self-registration — admins use /users to create elevated accounts
    body.role = ROLES.VIEWER;

    const user = await authService.register({
      ...body,
      requestId: req.id,
    });

    return sendSuccess(res, { user }, 'Account created successfully', 201);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/login
 */
export async function login(req, res, next) {
  try {
    const body = validate(loginSchema, req.body);

    const { accessToken, refreshToken, user } = await authService.login({
      email:     body.email,
      password:  body.password,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: req.id,
    });

    // Set refresh token as httpOnly cookie — never exposed to client JS
    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

    return sendSuccess(res, { accessToken, user }, 'Login successful');
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/refresh
 *
 * Reads refresh token from httpOnly cookie and issues a new access token.
 */
export async function refresh(req, res, next) {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return next(new (await import('../errors/errorTypes.js')).AuthenticationError(
        'No refresh token found. Please log in.'
      ));
    }

    const { accessToken } = await authService.refresh(refreshToken);

    return sendSuccess(res, { accessToken }, 'Token refreshed successfully');
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/logout
 *
 * Clears the refresh token cookie. Because tokens are stateless (not stored server-side),
 * the access token remains technically valid until expiry — see Known Tradeoffs in README.
 */
export async function logout(_req, res, next) {
  try {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path:     '/auth/refresh',
    });

    return sendSuccess(res, null, 'Logged out successfully');
  } catch (err) {
    return next(err);
  }
}
