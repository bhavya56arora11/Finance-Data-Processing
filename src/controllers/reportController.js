import { z } from 'zod';
import * as reportService from '../services/reportService.js';
import { sendSuccess } from '../utils/responseFormatter.js';
import { ValidationError } from '../errors/errorTypes.js';

const generateSchema = z.object({
  type: z.enum(['monthly', 'quarterly', 'annual', 'custom']),
  period: z.object({
    year:    z.number().int().optional(),
    month:   z.number().int().min(1).max(12).optional(),
    quarter: z.number().int().min(1).max(4).optional(),
    from:    z.string().optional(),
    to:      z.string().optional(),
  }),
  filters: z.object({
    categories: z.array(z.string()).optional(),
    types:      z.array(z.string()).optional(),
    department: z.string().optional(),
    status:     z.string().optional(),
  }).optional(),
}).superRefine((data, ctx) => {
  const { type, period } = data;
  if (type === 'monthly' && (!period.year || !period.month))
    ctx.addIssue({ code: 'custom', message: 'Year and month required for monthly report', path: ['period'] });
  if (type === 'quarterly' && (!period.year || !period.quarter))
    ctx.addIssue({ code: 'custom', message: 'Year and quarter required for quarterly report', path: ['period'] });
  if (type === 'annual' && !period.year)
    ctx.addIssue({ code: 'custom', message: 'Year required for annual report', path: ['period'] });
  if (type === 'custom') {
    if (!period.from || !period.to)
      ctx.addIssue({ code: 'custom', message: 'From and to dates required for custom report', path: ['period'] });
    if (period.from && period.to && new Date(period.to) <= new Date(period.from))
      ctx.addIssue({ code: 'custom', message: 'To must be after from', path: ['period', 'to'] });
    if (period.from && period.to) {
      const diff = (new Date(period.to) - new Date(period.from)) / (1000 * 60 * 60 * 24);
      if (diff > 730) ctx.addIssue({ code: 'custom', message: 'Range cannot exceed 2 years', path: ['period'] });
    }
  }
});

const listSchema = z.object({
  type:  z.enum(['monthly', 'quarterly', 'annual', 'custom']).optional(),
  from:  z.string().optional(),
  to:    z.string().optional(),
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })));
  }
  return result.data;
}

// POST /reports/generate
export async function generateReport(req, res, next) {
  try {
    const body = validate(generateSchema, req.body);
    const result = await reportService.generateReport(body, req.user, req.id);
    return sendSuccess(res, result, 'Report generation started', 202);
  } catch (err) { return next(err); }
}

// GET /reports
export async function listReports(req, res, next) {
  try {
    const query = validate(listSchema, req.query);
    const result = await reportService.listReports(query, req.user);
    return sendSuccess(res, {
      reports: result.reports,
      pagination: { total: result.total, page: result.page, totalPages: result.totalPages, limit: query.limit },
    });
  } catch (err) { return next(err); }
}

// GET /reports/:id
export async function getReportById(req, res, next) {
  try {
    const report = await reportService.getReportById(req.params.id, req.user);
    if (report.status === 'generating') {
      return sendSuccess(res, { reportId: report._id, status: 'generating' }, 'Report is still generating. Poll again shortly.', 202);
    }
    if (report.status === 'failed') {
      return res.status(500).json({ success: false, error: { code: 'REPORT_FAILED', message: 'Report generation failed', details: { error: report.error } } });
    }
    return sendSuccess(res, { report });
  } catch (err) { return next(err); }
}

// DELETE /reports/:id
export async function deleteReport(req, res, next) {
  try {
    await reportService.deleteReport(req.params.id, req.user, req.id);
    return sendSuccess(res, null, 'Report deleted');
  } catch (err) { return next(err); }
}
