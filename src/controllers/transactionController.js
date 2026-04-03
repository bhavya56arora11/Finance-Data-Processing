import { z } from 'zod';
import { TRANSACTION_TYPES, TRANSACTION_STATUSES, isValidSubtype } from '../constants/transactionTypes.js';
import * as txService from '../services/transactionService.js';
import { sendSuccess } from '../utils/responseFormatter.js';
import { ValidationError } from '../errors/errorTypes.js';

// ─── Validation Schemas ───────────────────────────────────────────────────────

const transactionSchema = z.object({
  amount: z.number({ required_error: 'Amount is required' })
    .positive('Amount must be greater than 0'),

  currency: z.string()
    .length(3, 'Currency must be a 3-letter ISO code')
    .toUpperCase()
    .default('USD'),

  type: z.enum(Object.values(TRANSACTION_TYPES), {
    required_error: 'Type is required',
    errorMap: () => ({ message: `Type must be one of: ${Object.values(TRANSACTION_TYPES).join(', ')}` }),
  }),

  subtype: z.string().optional(),

  category: z.string({ required_error: 'Category is required' })
    .trim()
    .min(2, 'Category must be at least 2 characters'),

  date: z.coerce.date({ required_error: 'Date is required' })
    .refine((d) => d <= new Date(), 'Date cannot be in the future'),

  notes:           z.string().max(1000, 'Notes cannot exceed 1000 characters').optional(),
  referenceNumber: z.string().trim().optional(),
  counterparty:    z.string().trim().optional(),
  department:      z.string().trim().optional(),
  project:         z.string().trim().optional(),
  tags:            z.array(z.string().trim()).optional(),
})
// Cross-field validation: subtype must belong to the selected type
.refine(
  (data) => isValidSubtype(data.type, data.subtype),
  (data) => ({
    message: `"${data.subtype}" is not a valid subtype for type "${data.type}"`,
    path:    ['subtype'],
  })
);

const listQuerySchema = z.object({
  search:        z.string().optional(),
  type:          z.enum(Object.values(TRANSACTION_TYPES)).optional(),
  subtype:       z.string().optional(),
  category:      z.string().optional(),
  status:        z.enum(Object.values(TRANSACTION_STATUSES)).optional(),
  department:    z.string().optional(),
  project:       z.string().optional(),
  tags:          z.union([z.string(), z.array(z.string())]).optional(),
  from:          z.string().optional(),
  to:            z.string().optional(),
  minAmount:     z.coerce.number().optional(),
  maxAmount:     z.coerce.number().optional(),
  currency:      z.string().optional(),
  fiscalYear:    z.coerce.number().optional(),
  fiscalQuarter: z.coerce.number().min(1).max(4).optional(),
  createdBy:     z.string().optional(),
  page:          z.coerce.number().int().min(1).default(1),
  limit:         z.coerce.number().int().min(1).max(100).default(20),
  sortBy:        z.string().optional(),
  sortOrder:     z.enum(['asc', 'desc']).optional(),
});

const rejectSchema = z.object({
  reason: z.string({ required_error: 'Rejection reason is required' }).min(1, 'Reason cannot be empty'),
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

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /transactions
 */
export async function createTransaction(req, res, next) {
  try {
    const data = validate(transactionSchema, req.body);
    const tx   = await txService.createTransaction(data, req.user, req.id);
    return sendSuccess(res, { transaction: tx }, 'Transaction created', 201);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /transactions
 */
export async function listTransactions(req, res, next) {
  try {
    const query  = validate(listQuerySchema, req.query);
    const result = await txService.listTransactions(query, req.queryScope);
    return sendSuccess(res, {
      transactions: result.transactions,
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
 * GET /transactions/:id
 */
export async function getTransactionById(req, res, next) {
  try {
    const tx = await txService.getTransactionById(req.params.id, req.queryScope, req.user);
    return sendSuccess(res, { transaction: tx });
  } catch (err) {
    return next(err);
  }
}

/**
 * PUT /transactions/:id
 */
export async function updateTransaction(req, res, next) {
  try {
    // Partial — all fields optional for updates
    const data = validate(transactionSchema.partial(), req.body);
    const tx   = await txService.updateTransaction(req.params.id, data, req.user, req.id);
    return sendSuccess(res, { transaction: tx }, 'Transaction updated');
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /transactions/:id
 */
export async function deleteTransaction(req, res, next) {
  try {
    await txService.deleteTransaction(req.params.id, req.user, req.id);
    return sendSuccess(res, null, 'Transaction deleted');
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /transactions/:id/approve
 */
export async function approveTransaction(req, res, next) {
  try {
    const tx = await txService.approveTransaction(req.params.id, req.user, req.id);
    return sendSuccess(res, { transaction: tx }, 'Transaction approved');
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /transactions/:id/reject
 */
export async function rejectTransaction(req, res, next) {
  try {
    const { reason } = validate(rejectSchema, req.body);
    const tx = await txService.rejectTransaction(req.params.id, reason, req.user, req.id);
    return sendSuccess(res, { transaction: tx }, 'Transaction rejected');
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /transactions/:id/void
 */
export async function voidTransaction(req, res, next) {
  try {
    const tx = await txService.voidTransaction(req.params.id, req.user, req.id);
    return sendSuccess(res, { transaction: tx }, 'Transaction voided');
  } catch (err) {
    return next(err);
  }
}
