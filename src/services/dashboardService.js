import Transaction from '../models/Transaction.js';
import { TRANSACTION_TYPES, TRANSACTION_STATUSES } from '../constants/transactionTypes.js';

// ─── Scope Helper ─────────────────────────────────────────────────────────────

/**
 * Converts req.queryScope into a $match stage for aggregation pipelines.
 * Removes the _includeDeleted meta-flag (not a real MongoDB field) and
 * ensures auditor queries bypass the soft-delete pre-find hook by using
 * the aggregation pipeline directly.
 *
 * @param {object} scope
 * @returns {{ matchStage: object, includeDeleted: boolean }}
 */
function buildAggregationScope(scope) {
  const { _includeDeleted, ...matchStage } = scope ?? {};
  // If auditor, include all records (even deleted) by not filtering isDeleted
  if (_includeDeleted) return { matchStage: {}, includeDeleted: true };
  return { matchStage: { isDeleted: false, ...matchStage }, includeDeleted: false };
}

// ─── Summary ──────────────────────────────────────────────────────────────────

/**
 * Returns a top-level financial summary using a single $facet aggregation.
 * All values computed in one round-trip to the database.
 *
 * @param {object} scope - req.queryScope
 * @returns {Promise<object>}
 */
export async function getSummary(scope) {
  const { matchStage } = buildAggregationScope(scope);

  const [result] = await Transaction.aggregate([
    { $match: matchStage },
    {
      $facet: {
        // Total income (approved only for accurate balance)
        income: [
          { $match: { type: TRANSACTION_TYPES.INCOME, status: TRANSACTION_STATUSES.APPROVED } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ],
        // Total expenses (approved only)
        expenses: [
          { $match: { type: TRANSACTION_TYPES.EXPENSE, status: TRANSACTION_STATUSES.APPROVED } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ],
        // Total count across all statuses (for volume reporting)
        totalCount: [
          { $count: 'count' },
        ],
        // Pending approvals count
        pendingApprovals: [
          { $match: { status: TRANSACTION_STATUSES.PENDING_APPROVAL } },
          { $count: 'count' },
        ],
        // Breakdown by status
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ],
        // Income and expense totals per currency
        byCurrency: [
          {
            $match: {
              status:  TRANSACTION_STATUSES.APPROVED,
              type:    { $in: [TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.EXPENSE] },
            },
          },
          {
            $group: {
              _id:      { currency: '$currency', type: '$type' },
              total:    { $sum: '$amount' },
            },
          },
        ],
      },
    },
  ]);

  const totalIncome   = result.income[0]?.total ?? 0;
  const totalExpenses = result.expenses[0]?.total ?? 0;

  // Reshape byStatus array → { draft: 5, approved: 12, ... }
  const byStatus = {};
  for (const s of result.byStatus) {
    byStatus[s._id] = s.count;
  }

  // Reshape byCurrency array → { USD: { income: 50000, expense: 12000 } }
  const byCurrency = {};
  for (const entry of result.byCurrency) {
    const { currency, type } = entry._id;
    if (!byCurrency[currency]) byCurrency[currency] = { income: 0, expense: 0 };
    byCurrency[currency][type === TRANSACTION_TYPES.INCOME ? 'income' : 'expense'] = entry.total;
  }

  return {
    totalIncome,
    totalExpenses,
    netBalance:         totalIncome - totalExpenses,
    totalTransactions:  result.totalCount[0]?.count ?? 0,
    pendingApprovals:   result.pendingApprovals[0]?.count ?? 0,
    byStatus,
    byCurrency,
  };
}

// ─── Category Breakdown ───────────────────────────────────────────────────────

/**
 * @param {object} scope
 * @param {object} filters - { type?, from?, to?, fiscalYear? }
 * @returns {Promise<{ category: string, type: string, total: number, count: number }[]>}
 */
export async function getCategoryBreakdown(scope, filters = {}) {
  const { matchStage } = buildAggregationScope(scope);

  const match = { ...matchStage };
  if (filters.type)       match.type       = filters.type;
  if (filters.fiscalYear) match.fiscalYear = Number(filters.fiscalYear);
  if (filters.from || filters.to) {
    match.date = {};
    if (filters.from) match.date.$gte = new Date(filters.from);
    if (filters.to)   match.date.$lte = new Date(filters.to);
  }

  return Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id:   { category: '$category', type: '$type' },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id:      0,
        category: '$_id.category',
        type:     '$_id.type',
        total:    1,
        count:    1,
      },
    },
    { $sort: { total: -1 } },
  ]);
}

// ─── Trends ───────────────────────────────────────────────────────────────────

/**
 * Groups approved income and expenses by calendar period (monthly or weekly).
 *
 * @param {object} scope
 * @param {object} params - { period, from, to }
 * @returns {Promise<{ period: string, income: number, expenses: number, net: number, transactionCount: number }[]>}
 */
export async function getTrends(scope, { period = 'monthly', from, to } = {}) {
  const { matchStage } = buildAggregationScope(scope);

  const match = {
    ...matchStage,
    status: TRANSACTION_STATUSES.APPROVED,
    type:   { $in: [TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.EXPENSE] },
  };

  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to)   match.date.$lte = new Date(to);
  }

  // $dateToString format string per period
  const dateFormat = period === 'weekly' ? '%G-W%V' : '%Y-%m';

  return Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id:              { period: { $dateToString: { format: dateFormat, date: '$date' } }, type: '$type' },
        total:            { $sum: '$amount' },
        transactionCount: { $sum: 1 },
      },
    },
    {
      // Pivot type dimension into income/expense fields
      $group: {
        _id:              '$_id.period',
        income:           { $sum: { $cond: [{ $eq: ['$_id.type', TRANSACTION_TYPES.INCOME] }, '$total', 0] } },
        expenses:         { $sum: { $cond: [{ $eq: ['$_id.type', TRANSACTION_TYPES.EXPENSE] }, '$total', 0] } },
        transactionCount: { $sum: '$transactionCount' },
      },
    },
    {
      $project: {
        _id:              0,
        period:           '$_id',
        income:           1,
        expenses:         1,
        net:              { $subtract: ['$income', '$expenses'] },
        transactionCount: 1,
      },
    },
    { $sort: { period: 1 } },
  ]);
}

// ─── Department Breakdown ─────────────────────────────────────────────────────

/**
 * @param {object} scope
 * @returns {Promise<{ department: string, income: number, expenses: number, net: number, count: number }[]>}
 */
export async function getDepartmentBreakdown(scope) {
  const { matchStage } = buildAggregationScope(scope);

  const match = {
    ...matchStage,
    status:     TRANSACTION_STATUSES.APPROVED,
    type:       { $in: [TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.EXPENSE] },
    department: { $ne: null },
  };

  return Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id:      { department: '$department', type: '$type' },
        total:    { $sum: '$amount' },
        count:    { $sum: 1 },
      },
    },
    {
      $group: {
        _id:      '$_id.department',
        income:   { $sum: { $cond: [{ $eq: ['$_id.type', TRANSACTION_TYPES.INCOME] }, '$total', 0] } },
        expenses: { $sum: { $cond: [{ $eq: ['$_id.type', TRANSACTION_TYPES.EXPENSE] }, '$total', 0] } },
        count:    { $sum: '$count' },
      },
    },
    {
      $project: {
        _id:        0,
        department: '$_id',
        income:     1,
        expenses:   1,
        net:        { $subtract: ['$income', '$expenses'] },
        count:      1,
      },
    },
    { $sort: { net: -1 } },
  ]);
}

// ─── Recent Activity ──────────────────────────────────────────────────────────

/**
 * @param {object} scope
 * @param {number} [limit=10]
 * @returns {Promise<object[]>}
 */
export async function getRecentActivity(scope, limit = 10) {
  const { matchStage, includeDeleted } = buildAggregationScope(scope);
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));

  // Can't use the Mongoose query helper here (aggregation bypasses pre-find hooks)
  // so we manually add isDeleted: false when needed
  const match = includeDeleted ? matchStage : { ...matchStage, isDeleted: false };

  return Transaction.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $limit: safeLimit },
    {
      $lookup: {
        from:         'users',
        localField:   'createdBy',
        foreignField: '_id',
        as:           'createdByUser',
        pipeline: [{ $project: { name: 1, email: 1 } }],
      },
    },
    {
      $project: {
        amount:       1,
        currency:     1,
        type:         1,
        category:     1,
        status:       1,
        date:         1,
        department:   1,
        createdAt:    1,
        createdBy:    { $arrayElemAt: ['$createdByUser', 0] },
      },
    },
  ]);
}
