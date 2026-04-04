import { z } from 'zod';
import { TRANSACTION_TYPES, TRANSACTION_STATUSES, isValidSubtype } from '../constants/transactionTypes.js';
import * as txService from '../services/transactionService.js';
import { sendSuccess } from '../utils/responseFormatter.js';
import { ValidationError, OperationNotPermittedError } from '../errors/errorTypes.js';

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

  category: z.string({ required_error: 'Category is required' }).regex(/^[a-f\d]{24}$/i, 'Must be a valid ObjectId'),

  description: z.string({ required_error: 'Description is required' })
    .trim().min(1, 'Description is required').max(200, 'Description cannot exceed 200 characters'),

  date: z.coerce.date({ required_error: 'Date is required' })
    .refine((d) => d <= new Date(), 'Date cannot be in the future'),

  notes:           z.string().max(1000, 'Notes cannot exceed 1000 characters').optional(),
  referenceNumber: z.string().trim().optional(),
  counterparty:    z.string().trim().optional(),
  department:      z.string().trim().optional(),
  project:         z.string().trim().optional(),
  tags:            z.array(z.string().trim()).optional(),
})
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
  cursor:        z.string().optional(), // base64-encoded _id for cursor pagination
});

const rejectSchema = z.object({
  reason: z.string({ required_error: 'Rejection reason is required' }).min(1, 'Reason cannot be empty'),
});

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

export async function createTransaction(req, res, next) {
  try {
    const data = validate(transactionSchema, req.body);
    const tx   = await txService.createTransaction(data, req.user, req.id);
    return sendSuccess(res, { transaction: tx }, 'Transaction created', 201);
  } catch (err) {
    return next(err);
  }
}

export async function listTransactions(req, res, next) {
  try {
    const query = validate(listQuerySchema, req.query);

    // Cursor mode: cursor param present
    if (query.cursor) {
      const result = await txService.listTransactionsCursor(query, req.queryScope);
      return sendSuccess(res, {
        transactions: result.transactions,
        pagination: {
          mode:       'cursor',
          nextCursor: result.nextCursor,
          hasNext:    result.hasNext,
          limit:      query.limit,
        },
      });
    }

    // Offset mode (default)
    const result = await txService.listTransactions(query, req.queryScope);
    return sendSuccess(res, {
      transactions: result.transactions,
      pagination: {
        mode:       'offset',
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

export async function getTransactionById(req, res, next) {
  try {
    const tx = await txService.getTransactionById(req.params.id, req.queryScope, req.user);
    return sendSuccess(res, { transaction: tx });
  } catch (err) {
    return next(err);
  }
}

export async function updateTransaction(req, res, next) {
  try {
    const data = validate(transactionSchema.partial(), req.body);
    const tx   = await txService.updateTransaction(req.params.id, data, req.user, req.id);
    return sendSuccess(res, { transaction: tx }, 'Transaction updated');
  } catch (err) {
    return next(err);
  }
}

export async function deleteTransaction(req, res, next) {
  try {
    await txService.deleteTransaction(req.params.id, req.user, req.id);
    return sendSuccess(res, null, 'Transaction deleted');
  } catch (err) {
    return next(err);
  }
}

export async function approveTransaction(req, res, next) {
  try {
    const tx = await txService.approveTransaction(req.params.id, req.user, req.id);
    return sendSuccess(res, { transaction: tx }, 'Transaction approved');
  } catch (err) {
    return next(err);
  }
}

export async function rejectTransaction(req, res, next) {
  try {
    const { reason } = validate(rejectSchema, req.body);
    const tx = await txService.rejectTransaction(req.params.id, reason, req.user, req.id);
    return sendSuccess(res, { transaction: tx }, 'Transaction rejected');
  } catch (err) {
    return next(err);
  }
}

export async function voidTransaction(req, res, next) {
  try {
    const tx = await txService.voidTransaction(req.params.id, req.user, req.id);
    return sendSuccess(res, { transaction: tx }, 'Transaction voided');
  } catch (err) {
    return next(err);
  }
}

export async function restoreTransaction(req, res, next) {
  try {
    const tx = await txService.restoreTransaction(req.params.id, req.user, req.id);
    return sendSuccess(res, { transaction: tx }, 'Transaction restored');
  } catch (err) {
    return next(err);
  }
}

export async function listDeletedTransactions(req, res, next) {
  try {
    const query = validate(listQuerySchema, req.query);
    const result = await txService.listDeletedTransactions(query, req.queryScope);
    return sendSuccess(res, {
      transactions: result.transactions,
      pagination: { mode: 'offset', total: result.total, page: result.page, totalPages: result.totalPages, limit: query.limit },
    });
  } catch (err) {
    return next(err);
  }
}

const exportQuerySchema = z.object({
  format:        z.enum(['json', 'csv']).default('json'),
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
  sortBy:        z.string().optional(),
  sortOrder:     z.enum(['asc', 'desc']).optional(),
});

export async function exportTransactions(req, res, next) {
  try {
    const { format, ...filterParams } = validate(exportQuerySchema, req.query);
    const result = await txService.exportTransactions(filterParams, req.queryScope);

    if (result.length > 1000) {
      throw new OperationNotPermittedError('Export exceeds 1000 records. Apply more filters to narrow the results.');
    }

    await txService.logExport(req.user, req.id, filterParams, result.length);

    if (format === 'csv') {
      const headers = ['Date', 'Description', 'Category', 'Type', 'Subtype', 'Amount', 'Currency', 'Status', 'Department', 'Reference', 'Notes'];
      const escCsv = (v) => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows = result.map((t) => [
        t.date ? new Date(t.date).toISOString().split('T')[0] : '',
        t.description, t.category?.name ?? t.category ?? '', t.type, t.subtype ?? '',
        t.amount, t.currency, t.status, t.department ?? '', t.referenceNumber ?? '', t.notes ?? '',
      ].map(escCsv).join(','));
      const csv = [headers.join(','), ...rows].join('\n');

      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="transactions-${ts}.csv"`);
      return res.send(csv);
    }

    return sendSuccess(res, { transactions: result, count: result.length });
  } catch (err) {
    return next(err);
  }
}

// GET /transactions/search — dedicated search endpoint
const searchQuerySchema = listQuerySchema.extend({
  search: z.string().min(2, 'Search query must be at least 2 characters'),
});

export async function searchTransactions(req, res, next) {
  try {
    const query = validate(searchQuerySchema, req.query);
    const result = await txService.listTransactions(query, req.queryScope);
    return sendSuccess(res, {
      transactions: result.transactions,
      pagination: {
        mode:       'offset',
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