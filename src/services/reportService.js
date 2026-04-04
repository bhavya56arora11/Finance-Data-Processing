import Report from '../models/Report.js';
import Transaction from '../models/Transaction.js';
import * as dashboardService from './dashboardService.js';
import * as auditService from './auditService.js';
import * as notificationService from './notificationService.js';
import { TRANSACTION_TYPES, TRANSACTION_STATUSES } from '../constants/transactionTypes.js';
import { NotFoundError, ScopeViolationError } from '../errors/errorTypes.js';
import { ROLES } from '../constants/roles.js';

const ELEVATED_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.FINANCE_MANAGER];

// Resolve period boundaries from type + params
function resolvePeriod(type, params) {
  let from, to, title;

  switch (type) {
    case 'monthly': {
      const y = params.year, m = params.month - 1;
      from  = new Date(Date.UTC(y, m, 1));
      to    = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
      title = `Monthly Report — ${from.toLocaleString('en', { month: 'long' })} ${y}`;
      return { from, to, title, fiscalYear: y, month: params.month, fiscalQuarter: Math.floor(m / 3) + 1 };
    }
    case 'quarterly': {
      const y = params.year, q = params.quarter;
      const startMonth = (q - 1) * 3;
      from  = new Date(Date.UTC(y, startMonth, 1));
      to    = new Date(Date.UTC(y, startMonth + 3, 0, 23, 59, 59, 999));
      title = `Quarterly Report — Q${q} ${y}`;
      return { from, to, title, fiscalYear: y, fiscalQuarter: q };
    }
    case 'annual': {
      const y = params.year;
      from  = new Date(Date.UTC(y, 0, 1));
      to    = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
      title = `Annual Report — ${y}`;
      return { from, to, title, fiscalYear: y };
    }
    case 'custom':
      from = new Date(params.from);
      to   = new Date(params.to);
      title = `Custom Report — ${from.toISOString().split('T')[0]} to ${to.toISOString().split('T')[0]}`;
      return { from, to, title };
    default:
      throw new Error('Invalid report type');
  }
}

// Generate a report (returns immediately, aggregation runs async)
export async function generateReport(data, reqUser, requestId) {
  const { from, to, title, ...periodMeta } = resolvePeriod(data.type, data.period);

  const report = await Report.create({
    title,
    type: data.type,
    generatedBy: reqUser.id,
    period: { from, to, ...periodMeta },
    filters: data.filters ?? {},
    status: 'generating',
  });

  // Async aggregation — fire and forget
  runAggregation(report._id, from, to, data.filters ?? {}, reqUser).catch((err) => {
    console.error('[ReportService] Background aggregation failed:', err.message);
  });

  await auditService.log({
    action: 'GENERATE_REPORT', performedBy: reqUser.id,
    targetResource: 'Report', targetId: report._id, requestId,
  });

  return { reportId: report._id, status: 'generating' };
}

// Background aggregation
async function runAggregation(reportId, from, to, filters, reqUser) {
  try {
    // Build scope: no user scoping on reports (they already have view:dashboard permission)
    const scope = { isDeleted: false };
    const dateMatch = { date: { $gte: from, $lte: to } };

    // Build additional match from filters
    const extraMatch = {};
    if (filters.types?.length)      extraMatch.type       = { $in: filters.types };
    if (filters.department)         extraMatch.department  = filters.department;
    if (filters.status)             extraMatch.status      = filters.status;
    if (filters.categories?.length) extraMatch.category    = { $in: filters.categories };

    const combinedScope = { ...scope, ...dateMatch, ...extraMatch };

    // Reuse dashboard service for consistent aggregation logic
    const [summary, trends, categoryBreakdown] = await Promise.all([
      dashboardService.getSummary(combinedScope),
      dashboardService.getTrends(combinedScope, { period: 'monthly' }),
      dashboardService.getCategoryBreakdown(combinedScope),
    ]);

    // Top 10 transactions by amount in period
    const topTransactions = await Transaction.find({ ...combinedScope, status: TRANSACTION_STATUSES.APPROVED })
      .sort({ amount: -1 }).limit(10).populate('category', 'name').lean();

    const transactionCount = await Transaction.countDocuments(combinedScope);

    await Report.findByIdAndUpdate(reportId, {
      status: 'ready',
      data: { summary, trends, categoryBreakdown, topTransactions, transactionCount },
    });

    notificationService.notify({
      recipient: reqUser.id, type: 'REPORT_READY',
      title: 'Report Ready',
      message: 'Your report has been generated and is ready to view.',
      data: { resourceType: 'Report', resourceId: reportId },
    }).catch(() => {});
  } catch (err) {
    await Report.findByIdAndUpdate(reportId, { status: 'failed', error: err.message });

    notificationService.notify({
      recipient: reqUser.id, type: 'REPORT_FAILED',
      title: 'Report Generation Failed',
      message: `Report generation failed: ${err.message}`,
      data: { resourceType: 'Report', resourceId: reportId },
    }).catch(() => {});
  }
}

// List reports (users see own, elevated roles see all)
export async function listReports(queryParams, reqUser) {
  const { type, from, to, page = 1, limit = 10 } = queryParams;
  const filter = {};

  if (!ELEVATED_ROLES.includes(reqUser.role)) filter.generatedBy = reqUser.id;
  if (type) filter.type = type;
  if (from || to) {
    filter['period.from'] = {};
    if (from) filter['period.from'].$gte = new Date(from);
    if (to)   filter['period.to'] = { $lte: new Date(to) };
  }

  const skip = (page - 1) * limit;
  const [reports, total] = await Promise.all([
    Report.find(filter).select('-data').sort({ createdAt: -1 }).skip(skip).limit(limit).populate('generatedBy', 'name email').lean(),
    Report.countDocuments(filter),
  ]);

  return { reports, total, page, totalPages: Math.ceil(total / limit) };
}

// Get a single report
export async function getReportById(id, reqUser) {
  const report = await Report.findById(id).populate('generatedBy', 'name email').lean();
  if (!report) throw new NotFoundError('Report');

  // Scope check: must own or have elevated role
  if (!ELEVATED_ROLES.includes(reqUser.role) && report.generatedBy._id.toString() !== reqUser.id) {
    throw new ScopeViolationError();
  }

  return report;
}

// Delete a report
export async function deleteReport(id, reqUser, requestId) {
  const report = await Report.findById(id);
  if (!report) throw new NotFoundError('Report');

  if (!ELEVATED_ROLES.includes(reqUser.role) && report.generatedBy.toString() !== reqUser.id) {
    throw new ScopeViolationError();
  }

  await Report.deleteOne({ _id: id });

  await auditService.log({
    action: 'DELETE_REPORT', performedBy: reqUser.id,
    targetResource: 'Report', targetId: report._id, requestId,
  });
}
