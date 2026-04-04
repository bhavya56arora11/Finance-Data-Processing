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
  exportTransactions,
  searchTransactions,
  restoreTransaction,
  listDeletedTransactions,
} from '../controllers/transactionController.js';

const router = Router();

router.use(authenticate);

router.post('/', requirePermission(PERMISSIONS.CREATE_TRANSACTIONS), createTransaction);

// Static paths before /:id to avoid param matching
router.get('/export', requirePermission(PERMISSIONS.EXPORT_DATA), scopeFilter, exportTransactions);
router.get('/search', requirePermission(PERMISSIONS.READ_TRANSACTIONS), scopeFilter, searchTransactions);
router.get('/deleted', requirePermission(PERMISSIONS.VIEW_DELETED), scopeFilter, listDeletedTransactions);

router.get('/', requirePermission(PERMISSIONS.READ_TRANSACTIONS), scopeFilter, listTransactions);
router.get('/:id', requirePermission(PERMISSIONS.READ_TRANSACTIONS), scopeFilter, getTransactionById);

router.put('/:id', requirePermission(PERMISSIONS.UPDATE_TRANSACTIONS), updateTransaction);
router.delete('/:id', requirePermission(PERMISSIONS.DELETE_TRANSACTIONS), deleteTransaction);

router.patch('/:id/approve', requirePermission(PERMISSIONS.APPROVE_TRANSACTIONS), approveTransaction);
router.patch('/:id/reject', requirePermission(PERMISSIONS.APPROVE_TRANSACTIONS), rejectTransaction);
router.patch('/:id/void', requirePermission(PERMISSIONS.UPDATE_TRANSACTIONS), voidTransaction);
router.patch('/:id/restore', requirePermission(PERMISSIONS.DELETE_TRANSACTIONS), restoreTransaction);

export default router;