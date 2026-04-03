import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSIONS } from '../constants/permissions.js';
import {
  listUsers,
  getUserById,
  updateUser,
  changeUserRole,
  deleteUser,
} from '../controllers/userController.js';

const router = Router();

// All user routes require authentication
router.use(authenticate);


// List all users with filters and pagination.
router.get('/', requirePermission(PERMISSIONS.MANAGE_USERS), listUsers);


// Get a single user. manage:users OR own profile (enforced in controller).
router.get('/:id', getUserById);


// Update name, department, or status.
router.patch('/:id', requirePermission(PERMISSIONS.MANAGE_USERS), updateUser);


// Change a user's role (requires manage:roles, higher than manage:users).
router.patch('/:id/role', requirePermission(PERMISSIONS.MANAGE_ROLES), changeUserRole);

// Soft-delete (set status inactive). Requires manage:users.
router.delete('/:id', requirePermission(PERMISSIONS.MANAGE_USERS), deleteUser);

export default router;