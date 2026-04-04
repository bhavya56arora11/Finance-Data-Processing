import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import * as auditService from './auditService.js';
import * as notificationService from './notificationService.js';
import { ROLES } from '../constants/roles.js';
import { TRANSACTION_STATUSES } from '../constants/transactionTypes.js';
import {
  buildTransactionFilter,
  buildSort,
  buildPagination,
} from '../utils/queryBuilder.js';
import {
  NotFoundError,
  InvalidStateError,
  OperationNotPermittedError,
  ScopeViolationError,
} from '../errors/errorTypes.js';

// Roles that can approve/modify without restrictions 

const PRIVILEGED_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.FINANCE_MANAGER];

// Create 

/**
 * Creates a new transaction.
 * Status is determined by role: privileged roles → approved, accountant → pending_approval.
 *
 * @param {object} data      - Validated transaction fields
 * @param {object} reqUser   - req.user JWT payload
 * @param {string} requestId
 * @returns {Promise<object>}
 */
export async function createTransaction(data, reqUser, requestId) {
  const status = PRIVILEGED_ROLES.includes(reqUser.role)
    ? TRANSACTION_STATUSES.APPROVED
    : TRANSACTION_STATUSES.PENDING_APPROVAL;

  const txData = {
    ...data,
    status,
    createdBy: reqUser.id,
    ...(status === TRANSACTION_STATUSES.APPROVED
      ? { approvedBy: reqUser.id, approvedAt: new Date() }
      : {}),
  };

  const transaction = await Transaction.create(txData);

  await auditService.log({
    action: 'CREATE_TRANSACTION',
    performedBy: reqUser.id,
    targetResource: 'Transaction',
    targetId: transaction._id,
    changes: { status: transaction.status, amount: transaction.amount },
    requestId,
  });

  // Notify finance managers when a transaction needs approval
  if (status === TRANSACTION_STATUSES.PENDING_APPROVAL) {
    User.find({ role: { $in: PRIVILEGED_ROLES }, status: 'active' }).select('_id').lean()
      .then((managers) => {
        for (const mgr of managers) {
          notificationService.notify({
            recipient: mgr._id, type: 'TRANSACTION_PENDING',
            title: 'Transaction Pending Approval',
            message: `A new ${data.type} transaction of ${data.amount} ${data.currency || 'USD'} requires approval.`,
            data: { resourceType: 'Transaction', resourceId: transaction._id },
          }).catch(() => { });
        }
      }).catch(() => { });
  }

  return transaction.toJSON();
}

// List ──

/**
 * Returns a paginated list of transactions applying scope + query filters.
 *
 * @param {object} queryParams - Validated query parameters
 * @param {object} scope       - req.queryScope from scopeFilter middleware
 * @returns {Promise<{ transactions: object[], total: number, page: number, totalPages: number }>}
 */
export async function listTransactions(queryParams, scope) {
  const { page, limit, sortBy, sortOrder, ...filterParams } = queryParams;

  // Extract _includeDeleted flag before building the scope filter
  const includeDeleted = scope._includeDeleted === true;
  const scopeFilter = { ...scope };
  delete scopeFilter._includeDeleted;

  const userFilter = buildTransactionFilter(filterParams);
  const combinedFilter = { ...scopeFilter, ...userFilter };
  const sort = buildSort(sortBy, sortOrder);
  const { skip, limit: safeLimit } = buildPagination(page, limit);

  const queryOptions = includeDeleted ? { _includeDeleted: true } : {};

  const [transactions, total] = await Promise.all([
    Transaction.find(combinedFilter, null, queryOptions)
      .populate('category', 'name slug type')
      .sort(sort).skip(skip).limit(safeLimit).lean(),
    Transaction.countDocuments(combinedFilter, queryOptions),
  ]);

  return {
    transactions,
    total,
    page: Number(page) || 1,
    totalPages: Math.ceil(total / safeLimit),
  };
}

// List (Cursor-based) ─

export async function listTransactionsCursor(queryParams, scope) {
  const { cursor, limit, sortBy, sortOrder, ...filterParams } = queryParams;

  const includeDeleted = scope._includeDeleted === true;
  const scopeFilter = { ...scope };
  delete scopeFilter._includeDeleted;

  const userFilter = buildTransactionFilter(filterParams);
  const combinedFilter = { ...scopeFilter, ...userFilter };
  const sort = buildSort(sortBy, sortOrder);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const queryOptions = includeDeleted ? { _includeDeleted: true } : {};

  // Decode cursor (base64 → ObjectId string)
  if (cursor) {
    const decodedId = Buffer.from(cursor, 'base64').toString('utf8');
    // Default sort is descending by date, so use $lt for forward pagination
    const isAsc = sortOrder === 'asc';
    combinedFilter._id = isAsc ? { $gt: decodedId } : { $lt: decodedId };
  }

  // Fetch one extra to detect hasNext
  const results = await Transaction.find(combinedFilter, null, queryOptions)
    .populate('category', 'name slug type')
    .sort(sort).limit(safeLimit + 1).lean();

  const hasNext = results.length > safeLimit;
  const transactions = hasNext ? results.slice(0, safeLimit) : results;
  const nextCursor = hasNext
    ? Buffer.from(transactions[transactions.length - 1]._id.toString()).toString('base64')
    : null;

  return { transactions, hasNext, nextCursor };
}

// Get One 

/**
 * Returns a single transaction by ID, with scope enforcement.
 *
 * @param {string} id
 * @param {object} scope    - req.queryScope
 * @param {object} reqUser
 * @returns {Promise<object>}
 */
export async function getTransactionById(id, scope, reqUser) {
  const includeDeleted = scope._includeDeleted === true;
  const queryOptions = includeDeleted ? { _includeDeleted: true } : {};

  const transaction = await Transaction.findById(id, null, queryOptions)
    .populate('createdBy', 'name email')
    .populate('approvedBy', 'name email')
    .populate('category', 'name slug type color')
    .lean();

  if (!transaction) throw new NotFoundError('Transaction');

  // Viewer scope enforcement: verify department matches
  if (reqUser.role === ROLES.VIEWER && reqUser.department) {
    if (transaction.department !== reqUser.department) {
      throw new ScopeViolationError();
    }
  }

  // External auditor scope: verify this transaction ID is in their allowed list
  if (reqUser.role === ROLES.EXTERNAL_AUDITOR) {
    const allowed = (reqUser.scopedRecords ?? []).map(String);
    if (!allowed.includes(transaction._id.toString())) {
      throw new ScopeViolationError();
    }
  }

  return transaction;
}

// Update 

/**
 * Updates a transaction with field-level change tracking.
 *
 * Business rules:
 *  - Voided transactions: no one can update
 *  - Approved transactions: only privileged roles can update; doing so resets to pending_approval
 *
 * @param {string} id
 * @param {object} updates   - Partial validated transaction fields
 * @param {object} reqUser
 * @param {string} requestId
 * @returns {Promise<object>}
 */
export async function updateTransaction(id, updates, reqUser, requestId) {
  const transaction = await Transaction.findById(id).setOptions({ _includeDeleted: false });
  if (!transaction) throw new NotFoundError('Transaction');

  if (transaction.status === TRANSACTION_STATUSES.VOIDED) {
    throw new OperationNotPermittedError('Voided transactions cannot be modified');
  }

  const isApproved = transaction.status === TRANSACTION_STATUSES.APPROVED;
  const isPrivileged = PRIVILEGED_ROLES.includes(reqUser.role);

  if (isApproved && !isPrivileged) {
    throw new OperationNotPermittedError(
      'Approved transactions can only be modified by Finance Manager, Admin, or Super Admin'
    );
  }

  // Snapshot current values for the changeHistory hook
  const trackedFields = ['amount', 'currency', 'type', 'subtype', 'category', 'date', 'status', 'notes'];
  transaction._previousValues = {};
  for (const field of trackedFields) {
    transaction._previousValues[field] = transaction[field];
  }

  // Apply updates
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) transaction[key] = value;
  }

  // If an approved transaction is being modified, reset to pending_approval
  if (isApproved) {
    transaction.status = TRANSACTION_STATUSES.PENDING_APPROVAL;
    transaction.approvedBy = null;
    transaction.approvedAt = null;
    if (!transaction.notes) {
      transaction.notes = `[Reset to pending: modified by ${reqUser.role}]`;
    } else {
      transaction.notes += ` | [Reset to pending: modified by ${reqUser.role}]`;
    }
  }

  transaction.lastModifiedBy = reqUser.id;
  await transaction.save();

  await auditService.log({
    action: 'UPDATE_TRANSACTION',
    performedBy: reqUser.id,
    targetResource: 'Transaction',
    targetId: transaction._id,
    changes: { updatedFields: Object.keys(updates) },
    requestId,
  });

  return transaction.toJSON();
}

// Soft Delete ─

/**
 * Soft-deletes a transaction.
 * Cannot delete approved transactions — they must be voided instead.
 *
 * @param {string} id
 * @param {object} reqUser
 * @param {string} requestId
 */
export async function deleteTransaction(id, reqUser, requestId) {
  const transaction = await Transaction.findById(id);
  if (!transaction) throw new NotFoundError('Transaction');

  if (transaction.status === TRANSACTION_STATUSES.APPROVED) {
    throw new OperationNotPermittedError(
      'Approved transactions cannot be deleted. Void instead.'
    );
  }

  transaction.isDeleted = true;
  transaction.deletedAt = new Date();
  transaction.deletedBy = reqUser.id;
  await transaction.save();

  await auditService.log({
    action: 'DELETE_TRANSACTION',
    performedBy: reqUser.id,
    targetResource: 'Transaction',
    targetId: transaction._id,
    requestId,
  });
}

// Restore 

export async function restoreTransaction(id, reqUser, requestId) {
  const transaction = await Transaction.findById(id).setOptions({ _includeDeleted: true });
  if (!transaction) throw new NotFoundError('Transaction');

  if (!transaction.isDeleted) {
    throw new InvalidStateError('Transaction is not deleted');
  }

  transaction.isDeleted = false;
  transaction.deletedAt = null;
  transaction.deletedBy = null;
  await transaction.save();

  await auditService.log({
    action: 'RESTORE_TRANSACTION', performedBy: reqUser.id,
    targetResource: 'Transaction', targetId: transaction._id, requestId,
  });

  return transaction.toJSON();
}

// List Deleted 

export async function listDeletedTransactions(queryParams, scope) {
  const { page, limit, sortBy, sortOrder, ...filterParams } = queryParams;

  const scopeFilter = { ...scope };
  delete scopeFilter._includeDeleted;

  const userFilter = buildTransactionFilter(filterParams);
  const combinedFilter = { ...scopeFilter, ...userFilter, isDeleted: true };
  const sort = buildSort(sortBy, sortOrder);
  const { skip, limit: safeLimit } = buildPagination(page, limit);

  const [transactions, total] = await Promise.all([
    Transaction.find(combinedFilter, null, { _includeDeleted: true })
      .populate('category', 'name slug type')
      .populate('deletedBy', 'name email')
      .sort(sort).skip(skip).limit(safeLimit).lean(),
    Transaction.countDocuments(combinedFilter, { _includeDeleted: true }),
  ]);

  return { transactions, total, page: Number(page) || 1, totalPages: Math.ceil(total / safeLimit) };
}

// Approve 

/**
 * @param {string} id
 * @param {object} reqUser
 * @param {string} requestId
 * @returns {Promise<object>}
 */
export async function approveTransaction(id, reqUser, requestId) {
  const transaction = await Transaction.findById(id);
  if (!transaction) throw new NotFoundError('Transaction');

  if (transaction.status !== TRANSACTION_STATUSES.PENDING_APPROVAL) {
    throw new InvalidStateError(
      `Cannot approve a transaction with status "${transaction.status}". Must be "pending_approval".`
    );
  }

  transaction.status = TRANSACTION_STATUSES.APPROVED;
  transaction.approvedBy = reqUser.id;
  transaction.approvedAt = new Date();
  await transaction.save();

  await auditService.log({
    action: 'APPROVE_TRANSACTION',
    performedBy: reqUser.id,
    targetResource: 'Transaction',
    targetId: transaction._id,
    requestId,
  });

  // Notify the creator
  notificationService.notify({
    recipient: transaction.createdBy, type: 'TRANSACTION_APPROVED',
    title: 'Transaction Approved',
    message: `Your ${transaction.type} transaction of ${transaction.amount} ${transaction.currency} has been approved.`,
    data: { resourceType: 'Transaction', resourceId: transaction._id },
  }).catch(() => { });

  return transaction.toJSON();
}

// Reject 

/**
 * @param {string} id
 * @param {string} reason
 * @param {object} reqUser
 * @param {string} requestId
 * @returns {Promise<object>}
 */
export async function rejectTransaction(id, reason, reqUser, requestId) {
  const transaction = await Transaction.findById(id);
  if (!transaction) throw new NotFoundError('Transaction');

  if (transaction.status !== TRANSACTION_STATUSES.PENDING_APPROVAL) {
    throw new InvalidStateError(
      `Cannot reject a transaction with status "${transaction.status}". Must be "pending_approval".`
    );
  }

  // Snapshot for history
  transaction._previousValues = { status: transaction.status, notes: transaction.notes };

  transaction.status = TRANSACTION_STATUSES.REJECTED;
  transaction.lastModifiedBy = reqUser.id;
  transaction.notes = transaction.notes
    ? `${transaction.notes} | [Rejected: ${reason}]`
    : `[Rejected: ${reason}]`;

  // Push rejection to changeHistory manually since status changed without a data field update
  transaction.changeHistory.push({
    modifiedBy: reqUser.id,
    modifiedAt: new Date(),
    changedFields: ['status', 'notes'],
    previousValues: transaction._previousValues,
  });
  delete transaction._previousValues;

  await transaction.save();

  await auditService.log({
    action: 'REJECT_TRANSACTION',
    performedBy: reqUser.id,
    targetResource: 'Transaction',
    targetId: transaction._id,
    changes: { reason },
    requestId,
  });

  // Notify the creator
  notificationService.notify({
    recipient: transaction.createdBy, type: 'TRANSACTION_REJECTED',
    title: 'Transaction Rejected',
    message: `Your ${transaction.type} transaction of ${transaction.amount} ${transaction.currency} was rejected. Reason: ${reason}`,
    data: { resourceType: 'Transaction', resourceId: transaction._id },
  }).catch(() => { });

  return transaction.toJSON();
}

// Void 

/**
 * @param {string} id
 * @param {object} reqUser
 * @param {string} requestId
 * @returns {Promise<object>}
 */
export async function voidTransaction(id, reqUser, requestId) {
  if (!PRIVILEGED_ROLES.includes(reqUser.role)) {
    throw new OperationNotPermittedError(
      'Only Finance Manager, Admin, or Super Admin can void transactions'
    );
  }

  const transaction = await Transaction.findById(id);
  if (!transaction) throw new NotFoundError('Transaction');

  if (transaction.status === TRANSACTION_STATUSES.VOIDED) {
    throw new InvalidStateError('Transaction is already voided');
  }

  transaction._previousValues = { status: transaction.status };
  transaction.status = TRANSACTION_STATUSES.VOIDED;
  transaction.lastModifiedBy = reqUser.id;

  transaction.changeHistory.push({
    modifiedBy: reqUser.id,
    modifiedAt: new Date(),
    changedFields: ['status'],
    previousValues: transaction._previousValues,
  });
  delete transaction._previousValues;

  await transaction.save();

  await auditService.log({
    action: 'VOID_TRANSACTION',
    performedBy: reqUser.id,
    targetResource: 'Transaction',
    targetId: transaction._id,
    requestId,
  });

  return transaction.toJSON();
}

// Export 

// Returns unpaginated list for export (controller enforces 1000 cap)
export async function exportTransactions(queryParams, scope) {
  const { sortBy, sortOrder, ...filterParams } = queryParams;

  const includeDeleted = scope._includeDeleted === true;
  const scopeFilter = { ...scope };
  delete scopeFilter._includeDeleted;

  const userFilter = buildTransactionFilter(filterParams);
  const combinedFilter = { ...scopeFilter, ...userFilter };
  const sort = buildSort(sortBy, sortOrder);
  const queryOptions = includeDeleted ? { _includeDeleted: true } : {};

  // Fetch limit+1 so controller can detect overflow
  return Transaction.find(combinedFilter, null, queryOptions)
    .sort(sort).limit(1001).populate('category', 'name slug').lean();
}

// Audit log entry for exports
export async function logExport(reqUser, requestId, filters, count) {
  await auditService.log({
    action: 'EXPORT_TRANSACTIONS',
    performedBy: reqUser.id,
    targetResource: 'Transaction',
    changes: { filters, exportedCount: count },
    requestId,
  });
}