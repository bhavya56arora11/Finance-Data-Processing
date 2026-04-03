import Transaction from '../models/Transaction.js';
import * as auditService from './auditService.js';
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

// ─── Roles that can approve/modify without restrictions ───────────────────────

const PRIVILEGED_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.FINANCE_MANAGER];

// ─── Create ───────────────────────────────────────────────────────────────────

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
    action:         'CREATE_TRANSACTION',
    performedBy:    reqUser.id,
    targetResource: 'Transaction',
    targetId:       transaction._id,
    changes:        { status: transaction.status, amount: transaction.amount },
    requestId,
  });

  return transaction.toJSON();
}

// ─── List ─────────────────────────────────────────────────────────────────────

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
  const scopeFilter    = { ...scope };
  delete scopeFilter._includeDeleted;

  const userFilter      = buildTransactionFilter(filterParams);
  const combinedFilter  = { ...scopeFilter, ...userFilter };
  const sort            = buildSort(sortBy, sortOrder);
  const { skip, limit: safeLimit } = buildPagination(page, limit);

  const queryOptions = includeDeleted ? { _includeDeleted: true } : {};

  const [transactions, total] = await Promise.all([
    Transaction.find(combinedFilter, null, queryOptions)
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

// ─── Get One ──────────────────────────────────────────────────────────────────

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
  const queryOptions   = includeDeleted ? { _includeDeleted: true } : {};

  const transaction = await Transaction.findById(id, null, queryOptions)
    .populate('createdBy', 'name email')
    .populate('approvedBy', 'name email')
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

// ─── Update ───────────────────────────────────────────────────────────────────

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

  const isApproved   = transaction.status === TRANSACTION_STATUSES.APPROVED;
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
    transaction.status    = TRANSACTION_STATUSES.PENDING_APPROVAL;
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
    action:         'UPDATE_TRANSACTION',
    performedBy:    reqUser.id,
    targetResource: 'Transaction',
    targetId:       transaction._id,
    changes:        { updatedFields: Object.keys(updates) },
    requestId,
  });

  return transaction.toJSON();
}

// ─── Soft Delete ──────────────────────────────────────────────────────────────

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
    action:         'DELETE_TRANSACTION',
    performedBy:    reqUser.id,
    targetResource: 'Transaction',
    targetId:       transaction._id,
    requestId,
  });
}

// ─── Approve ──────────────────────────────────────────────────────────────────

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

  transaction.status     = TRANSACTION_STATUSES.APPROVED;
  transaction.approvedBy = reqUser.id;
  transaction.approvedAt = new Date();
  await transaction.save();

  await auditService.log({
    action:         'APPROVE_TRANSACTION',
    performedBy:    reqUser.id,
    targetResource: 'Transaction',
    targetId:       transaction._id,
    requestId,
  });

  return transaction.toJSON();
}

// ─── Reject ───────────────────────────────────────────────────────────────────

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

  transaction.status         = TRANSACTION_STATUSES.REJECTED;
  transaction.lastModifiedBy = reqUser.id;
  transaction.notes          = transaction.notes
    ? `${transaction.notes} | [Rejected: ${reason}]`
    : `[Rejected: ${reason}]`;

  // Push rejection to changeHistory manually since status changed without a data field update
  transaction.changeHistory.push({
    modifiedBy:     reqUser.id,
    modifiedAt:     new Date(),
    changedFields:  ['status', 'notes'],
    previousValues: transaction._previousValues,
  });
  delete transaction._previousValues;

  await transaction.save();

  await auditService.log({
    action:         'REJECT_TRANSACTION',
    performedBy:    reqUser.id,
    targetResource: 'Transaction',
    targetId:       transaction._id,
    changes:        { reason },
    requestId,
  });

  return transaction.toJSON();
}

// ─── Void ─────────────────────────────────────────────────────────────────────

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
  transaction.status          = TRANSACTION_STATUSES.VOIDED;
  transaction.lastModifiedBy  = reqUser.id;

  transaction.changeHistory.push({
    modifiedBy:     reqUser.id,
    modifiedAt:     new Date(),
    changedFields:  ['status'],
    previousValues: transaction._previousValues,
  });
  delete transaction._previousValues;

  await transaction.save();

  await auditService.log({
    action:         'VOID_TRANSACTION',
    performedBy:    reqUser.id,
    targetResource: 'Transaction',
    targetId:       transaction._id,
    requestId,
  });

  return transaction.toJSON();
}
