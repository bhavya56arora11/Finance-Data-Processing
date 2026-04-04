import Transaction from '../models/Transaction.js';
import { TRANSACTION_TYPES, TRANSACTION_STATUSES } from '../constants/transactionTypes.js';

function buildAggregationScope(scope) {
  const { _includeDeleted, ...matchStage } = scope ?? {};
  if (_includeDeleted) return { matchStage: {}, includeDeleted: true };
  return { matchStage: { isDeleted: false, ...matchStage }, includeDeleted: false };
}

// Summary

export async function getSummary(scope) {
  const { matchStage } = buildAggregationScope(scope);

  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart    = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const prevMonthStart    = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const [result] = await Transaction.aggregate([
    { $match: matchStage },
    {
      $facet: {
        income: [
          { $match: { type: TRANSACTION_TYPES.INCOME, status: TRANSACTION_STATUSES.APPROVED } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ],
        expenses: [
          { $match: { type: TRANSACTION_TYPES.EXPENSE, status: TRANSACTION_STATUSES.APPROVED } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ],
        totalCount: [{ $count: 'count' }],
        pendingApprovals: [
          { $match: { status: TRANSACTION_STATUSES.PENDING_APPROVAL } },
          { $count: 'count' },
        ],
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ],
        byCurrency: [
          { $match: { status: TRANSACTION_STATUSES.APPROVED, type: { $in: [TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.EXPENSE] } } },
          { $group: { _id: { currency: '$currency', type: '$type' }, total: { $sum: '$amount' } } },
        ],
        currentMonthIncome: [
          { $match: { type: TRANSACTION_TYPES.INCOME, status: TRANSACTION_STATUSES.APPROVED, date: { $gte: currentMonthStart, $lt: nextMonthStart } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ],
        currentMonthExpenses: [
          { $match: { type: TRANSACTION_TYPES.EXPENSE, status: TRANSACTION_STATUSES.APPROVED, date: { $gte: currentMonthStart, $lt: nextMonthStart } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ],
        previousMonthIncome: [
          { $match: { type: TRANSACTION_TYPES.INCOME, status: TRANSACTION_STATUSES.APPROVED, date: { $gte: prevMonthStart, $lt: currentMonthStart } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ],
        previousMonthExpenses: [
          { $match: { type: TRANSACTION_TYPES.EXPENSE, status: TRANSACTION_STATUSES.APPROVED, date: { $gte: prevMonthStart, $lt: currentMonthStart } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ],
      },
    },
  ]);

  const totalIncome   = result.income[0]?.total ?? 0;
  const totalExpenses = result.expenses[0]?.total ?? 0;

  const byStatus = {};
  for (const s of result.byStatus) byStatus[s._id] = s.count;

  const byCurrency = {};
  for (const entry of result.byCurrency) {
    const { currency, type } = entry._id;
    if (!byCurrency[currency]) byCurrency[currency] = { income: 0, expense: 0 };
    byCurrency[currency][type === TRANSACTION_TYPES.INCOME ? 'income' : 'expense'] = entry.total;
  }

  // Growth calculation
  const monthlyIncome   = result.currentMonthIncome[0]?.total ?? 0;
  const monthlyExpenses = result.currentMonthExpenses[0]?.total ?? 0;
  const currentMonthNet = monthlyIncome - monthlyExpenses;
  const previousMonthNet = (result.previousMonthIncome[0]?.total ?? 0) - (result.previousMonthExpenses[0]?.total ?? 0);

  let growthPercentage = 0;
  let growthDirection  = 'neutral';
  if (previousMonthNet !== 0) {
    growthPercentage = ((currentMonthNet - previousMonthNet) / Math.abs(previousMonthNet)) * 100;
    growthDirection  = growthPercentage > 0 ? 'up' : growthPercentage < 0 ? 'down' : 'neutral';
    growthPercentage = Math.round(growthPercentage * 100) / 100;
  }

  return {
    totalIncome,
    totalExpenses,
    netBalance: totalIncome - totalExpenses,
    totalTransactions: result.totalCount[0]?.count ?? 0,
    pendingApprovals:  result.pendingApprovals[0]?.count ?? 0,
    byStatus,
    byCurrency,
    monthlyIncome,
    monthlyExpenses,
    netSavings: currentMonthNet,
    growth: {
      percentage: growthPercentage,
      direction:  growthDirection,
      comparedTo: 'last_month',
    },
  };
}

// Category Breakdown

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
    { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'categoryDoc', pipeline: [{ $project: { name: 1, slug: 1 } }] } },
    { $group: {
        _id:   { category: '$category', type: '$type' },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
        categoryName: { $first: { $arrayElemAt: ['$categoryDoc.name', 0] } },
    } },
    { $project: { _id: 0, categoryId: '$_id.category', categoryName: 1, type: '$_id.type', total: 1, count: 1 } },
    { $sort: { total: -1 } },
  ]);
}

// Trends

export async function getTrends(scope, { period = 'monthly', from, to, timeframe } = {}) {
  const { matchStage } = buildAggregationScope(scope);

  const match = {
    ...matchStage,
    status: TRANSACTION_STATUSES.APPROVED,
    type:   { $in: [TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.EXPENSE] },
  };

  // Timeframe filter (6m or 1y override from/to)
  if (timeframe && !from && !to) {
    const now = new Date();
    if (timeframe === '6m') {
      match.date = { $gte: new Date(now.getFullYear(), now.getMonth() - 6, 1) };
    } else if (timeframe === '1y') {
      match.date = { $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) };
    }
  } else if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to)   match.date.$lte = new Date(to);
  }

  const dateFormat = period === 'weekly' ? '%G-W%V' : '%Y-%m';

  const trends = await Transaction.aggregate([
    { $match: match },
    { $group: {
        _id: { period: { $dateToString: { format: dateFormat, date: '$date' } }, type: '$type' },
        total: { $sum: '$amount' },
        transactionCount: { $sum: 1 },
    } },
    { $group: {
        _id: '$_id.period',
        income:   { $sum: { $cond: [{ $eq: ['$_id.type', TRANSACTION_TYPES.INCOME] }, '$total', 0] } },
        expenses: { $sum: { $cond: [{ $eq: ['$_id.type', TRANSACTION_TYPES.EXPENSE] }, '$total', 0] } },
        transactionCount: { $sum: '$transactionCount' },
    } },
    { $project: {
        _id: 0, period: '$_id',
        income: 1, expenses: 1,
        net: { $subtract: ['$income', '$expenses'] },
        transactionCount: 1,
    } },
    { $sort: { period: 1 } },
  ]);

  // Compute cumulativeBalance in-app
  let cumulative = 0;
  for (const t of trends) {
    cumulative += t.net;
    t.cumulativeBalance = Math.round(cumulative * 100) / 100;
  }

  return trends;
}

// Department Breakdown

export async function getDepartmentBreakdown(scope) {
  const { matchStage } = buildAggregationScope(scope);
  const match = {
    ...matchStage,
    status: TRANSACTION_STATUSES.APPROVED,
    type:   { $in: [TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.EXPENSE] },
    department: { $ne: null },
  };

  return Transaction.aggregate([
    { $match: match },
    { $group: { _id: { department: '$department', type: '$type' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    { $group: {
        _id: '$_id.department',
        income:   { $sum: { $cond: [{ $eq: ['$_id.type', TRANSACTION_TYPES.INCOME] }, '$total', 0] } },
        expenses: { $sum: { $cond: [{ $eq: ['$_id.type', TRANSACTION_TYPES.EXPENSE] }, '$total', 0] } },
        count: { $sum: '$count' },
    } },
    { $project: { _id: 0, department: '$_id', income: 1, expenses: 1, net: { $subtract: ['$income', '$expenses'] }, count: 1 } },
    { $sort: { net: -1 } },
  ]);
}

// Recent Activity

export async function getRecentActivity(scope, limit = 10) {
  const { matchStage, includeDeleted } = buildAggregationScope(scope);
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));
  const match = includeDeleted ? matchStage : { ...matchStage, isDeleted: false };

  return Transaction.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $limit: safeLimit },
    { $lookup: { from: 'users', localField: 'createdBy', foreignField: '_id', as: 'createdByUser', pipeline: [{ $project: { name: 1, email: 1 } }] } },
    { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'categoryDoc', pipeline: [{ $project: { name: 1, slug: 1 } }] } },
    { $project: {
        amount: 1, currency: 1, type: 1, description: 1,
        category: { $arrayElemAt: ['$categoryDoc', 0] },
        status: 1, date: 1, department: 1, createdAt: 1,
        createdBy: { $arrayElemAt: ['$createdByUser', 0] },
    } },
  ]);
}