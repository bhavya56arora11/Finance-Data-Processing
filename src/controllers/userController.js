import { z } from 'zod';
import { ROLES } from '../constants/roles.js';
import * as userService from '../services/userService.js';
import { sendSuccess } from '../utils/responseFormatter.js';
import {
  ValidationError,
  AuthorizationError,
  NotFoundError,
} from '../errors/errorTypes.js';

// ─── Validation Schemas ───────────────────────────────────────────────────────

const updateUserSchema = z.object({
  name:       z.string().trim().min(2, 'Name must be at least 2 characters').optional(),
  department: z.string().trim().optional(),
  status:     z.enum(['active', 'inactive', 'suspended']).optional(),
}).strict({ message: 'Only name, department, and status may be updated via this endpoint' });

const changeRoleSchema = z.object({
  role: z.enum(Object.values(ROLES), {
    errorMap: () => ({ message: `Role must be one of: ${Object.values(ROLES).join(', ')}` }),
  }),
});

const listUsersSchema = z.object({
  role:       z.enum(Object.values(ROLES)).optional(),
  status:     z.enum(['active', 'inactive', 'suspended']).optional(),
  department: z.string().optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Validation Helper ────────────────────────────────────────────────────────

function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.errors.map((e) => ({
      field:   e.path.join('.'),
      message: e.message,
    }));
    throw new ValidationError(details);
  }
  return result.data;
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /users
 * Requires manage:users
 */
export async function listUsers(req, res, next) {
  try {
    const query = validate(listUsersSchema, req.query);
    const result = await userService.listUsers(query);

    return sendSuccess(res, {
      users: result.users,
      pagination: {
        total:      result.total,
        page:       result.page,
        totalPages: result.totalPages,
        limit:      query.limit,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /users/:id
 * Requires manage:users OR requesting own profile
 */
export async function getUserById(req, res, next) {
  try {
    const { id } = req.params;
    const requestingUser = req.user;

    // Users can always fetch their own profile; manage:users holders can fetch any
    const isSelf = id === requestingUser.id;
    const canManage = (requestingUser.permissions ?? []).includes('manage:users');

    if (!isSelf && !canManage) {
      throw new AuthorizationError('manage:users');
    }

    const user = await userService.getUserById(id);
    return sendSuccess(res, { user });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /users/:id
 * Requires manage:users
 */
export async function updateUser(req, res, next) {
  try {
    const updates = validate(updateUserSchema, req.body);
    const user = await userService.updateUser({
      targetId:       req.params.id,
      updates,
      requestingUser: req.user,
      requestId:      req.id,
    });

    return sendSuccess(res, { user }, 'User updated successfully');
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /users/:id/role
 * Requires manage:roles
 */
export async function changeUserRole(req, res, next) {
  try {
    const { role } = validate(changeRoleSchema, req.body);

    const user = await userService.changeUserRole({
      targetId:       req.params.id,
      newRole:        role,
      requestingUser: req.user,
      requestId:      req.id,
    });

    return sendSuccess(res, { user }, `Role updated to ${role}`);
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /users/:id
 * Requires manage:users
 */
export async function deleteUser(req, res, next) {
  try {
    await userService.softDeleteUser({
      targetId:       req.params.id,
      requestingUser: req.user,
      requestId:      req.id,
    });

    return sendSuccess(res, null, 'User deactivated successfully');
  } catch (err) {
    return next(err);
  }
}
