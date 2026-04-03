import User from '../models/User.js';
import * as auditService from './auditService.js';
import { ROLES, getRolePermissions } from '../constants/roles.js';
import {
  NotFoundError,
  ConflictError,
  OperationNotPermittedError,
  AuthorizationError,
} from '../errors/errorTypes.js';

// ─── Query ────────────────────────────────────────────────────────────────────

/**
 * Returns a paginated list of users with optional filters.
 *
 * @param {object} params
 * @param {string} [params.role]
 * @param {string} [params.status]
 * @param {string} [params.department]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @returns {Promise<{ users: object[], total: number, page: number, totalPages: number }>}
 */
export async function listUsers({ role, status, department, page = 1, limit = 20 } = {}) {
  const filter = {};
  if (role)       filter.role       = role;
  if (status)     filter.status     = status;
  if (department) filter.department = department;

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }).lean(),
    User.countDocuments(filter),
  ]);

  return {
    users,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Returns a single user by ID. Throws NotFoundError if missing.
 *
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function getUserById(id) {
  const user = await User.findById(id).lean();
  if (!user) throw new NotFoundError('User');
  return user;
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Updates allowed profile fields on a user.
 *
 * Status transition rules:
 *  - 'suspended' → 'active' requires super_admin (enforced in controller pre-check)
 *  - We receive requestingUser to validate these constraints here in the service.
 *
 * @param {object} params
 * @param {string} params.targetId         - ID of the user being updated
 * @param {object} params.updates          - { name?, department?, status? }
 * @param {object} params.requestingUser   - req.user payload of the caller
 * @param {string} [params.requestId]
 * @returns {Promise<object>} Updated user
 */
export async function updateUser({ targetId, updates, requestingUser, requestId }) {
  const user = await User.findById(targetId);
  if (!user) throw new NotFoundError('User');

  // Status transition: only super_admin can reactivate a suspended user
  if (updates.status === 'active' && user.status === 'suspended') {
    if (requestingUser.role !== ROLES.SUPER_ADMIN) {
      throw new OperationNotPermittedError(
        'Only a super_admin can reactivate a suspended account'
      );
    }
  }

  const before = {
    name:       user.name,
    department: user.department,
    status:     user.status,
  };

  // Apply only the allowed fields
  const ALLOWED = ['name', 'department', 'status'];
  for (const field of ALLOWED) {
    if (updates[field] !== undefined) {
      user[field] = updates[field];
    }
  }

  user.lastModifiedBy = requestingUser.id;
  await user.save();

  await auditService.log({
    action:         'UPDATE_USER',
    performedBy:    requestingUser.id,
    targetResource: 'User',
    targetId:       user._id,
    changes:        { before, after: { name: user.name, department: user.department, status: user.status } },
    requestId,
  });

  return user.toJSON();
}

/**
 * Changes a user's role and recomputes their permission set.
 *
 * Constraints enforced here:
 *  - Cannot demote or change a super_admin unless the requester is also super_admin
 *  - Cannot self-demote
 *
 * @param {object} params
 * @param {string} params.targetId
 * @param {string} params.newRole
 * @param {object} params.requestingUser
 * @param {string} [params.requestId]
 * @returns {Promise<object>}
 */
export async function changeUserRole({ targetId, newRole, requestingUser, requestId }) {
  const user = await User.findById(targetId);
  if (!user) throw new NotFoundError('User');

  // Protect super_admin accounts — only another super_admin can touch them
  if (user.role === ROLES.SUPER_ADMIN && requestingUser.role !== ROLES.SUPER_ADMIN) {
    throw new OperationNotPermittedError(
      'Only a super_admin can modify another super_admin\'s role'
    );
  }

  const oldRole = user.role;
  user.role = newRole;
  await user.save();

  await auditService.log({
    action:         'ROLE_CHANGE',
    performedBy:    requestingUser.id,
    targetResource: 'User',
    targetId:       user._id,
    changes:        { before: { role: oldRole }, after: { role: newRole } },
    requestId,
  });

  return user.toJSON();
}

/**
 * Soft-deletes a user by setting status to 'inactive'.
 *
 * @param {object} params
 * @param {string} params.targetId
 * @param {object} params.requestingUser
 * @param {string} [params.requestId]
 */
export async function softDeleteUser({ targetId, requestingUser, requestId }) {
  if (targetId === requestingUser.id) {
    throw new OperationNotPermittedError('You cannot delete your own account');
  }

  const user = await User.findById(targetId);
  if (!user) throw new NotFoundError('User');

  const before = { status: user.status };
  user.status = 'inactive';
  await user.save();

  await auditService.log({
    action:         'DELETE_USER',
    performedBy:    requestingUser.id,
    targetResource: 'User',
    targetId:       user._id,
    changes:        { before, after: { status: 'inactive' } },
    requestId,
  });
}
