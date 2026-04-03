import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { scopeFilter } from '../middleware/scopeFilter.js';
import { PERMISSIONS } from '../constants/permissions.js';
import {
  createTransaction,
  listTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  approveTransaction,
  rejectTransaction,
  voidTransaction,
} from '../controllers/transactionController.js';

const router = Router();

// All transaction routes require authentication
router.use(authenticate);

// Create a new transaction
router.post(
  '/',
  requirePermission(PERMISSIONS.CREATE_TRANSACTIONS),
  createTransaction
);

// List with filters, pagination, scope
router.get(
  '/',
  requirePermission(PERMISSIONS.READ_TRANSACTIONS),
  scopeFilter,
  listTransactions
);

// Single transaction with scope check
router.get(
  '/:id',
  requirePermission(PERMISSIONS.READ_TRANSACTIONS),
  scopeFilter,
  getTransactionById
);

// Full/partial update
router.put(
  '/:id',
  requirePermission(PERMISSIONS.UPDATE_TRANSACTIONS),
  updateTransaction
);

// Soft delete
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.DELETE_TRANSACTIONS),
  deleteTransaction
);

router.patch(
  '/:id/approve',
  requirePermission(PERMISSIONS.APPROVE_TRANSACTIONS),
  approveTransaction
);

router.patch(
  '/:id/reject',
  requirePermission(PERMISSIONS.APPROVE_TRANSACTIONS),
  rejectTransaction
);

// update:transactions permission + role check enforced in service layer
router.patch(
  '/:id/void',
  requirePermission(PERMISSIONS.UPDATE_TRANSACTIONS),
  voidTransaction
);

export default router;