import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { listCategories, createCategory, updateCategory, deleteCategory } from '../controllers/categoryController.js';

const router = Router();

router.use(authenticate);

// All authenticated users can list
router.get('/', listCategories);

// manage:users can create and update
router.post('/', requirePermission(PERMISSIONS.MANAGE_USERS), createCategory);
router.patch('/:id', requirePermission(PERMISSIONS.MANAGE_USERS), updateCategory);

// manage:roles can delete
router.delete('/:id', requirePermission(PERMISSIONS.MANAGE_ROLES), deleteCategory);

export default router;
