import { z } from 'zod';
import { TRANSACTION_TYPES } from '../constants/transactionTypes.js';
import * as dashboardService from '../services/dashboardService.js';
import { sendSuccess } from '../utils/responseFormatter.js';
import { ValidationError } from '../errors/errorTypes.js';

const categoryBreakdownSchema = z.object({
  type:       z.enum(Object.values(TRANSACTION_TYPES)).optional(),
  from:       z.string().optional(),
  to:         z.string().optional(),
  fiscalYear: z.coerce.number().int().optional(),
});

const trendsSchema = z.object({
  period:    z.enum(['monthly', 'weekly']).default('monthly'),
  from:      z.string().optional(),
  to:        z.string().optional(),
  timeframe: z.enum(['6m', '1y', 'all']).default('all'),
});

const recentActivitySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
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

export async function getSummary(req, res, next) {
  try {
    const data = await dashboardService.getSummary(req.queryScope);
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

export async function getCategoryBreakdown(req, res, next) {
  try {
    const filters = validate(categoryBreakdownSchema, req.query);
    const data    = await dashboardService.getCategoryBreakdown(req.queryScope, filters);
    return sendSuccess(res, { breakdown: data });
  } catch (err) {
    return next(err);
  }
}

export async function getTrends(req, res, next) {
  try {
    const params = validate(trendsSchema, req.query);
    const data   = await dashboardService.getTrends(req.queryScope, params);
    return sendSuccess(res, { trends: data, period: params.period });
  } catch (err) {
    return next(err);
  }
}

export async function getDepartmentBreakdown(req, res, next) {
  try {
    const data = await dashboardService.getDepartmentBreakdown(req.queryScope);
    return sendSuccess(res, { breakdown: data });
  } catch (err) {
    return next(err);
  }
}

export async function getRecentActivity(req, res, next) {
  try {
    const { limit } = validate(recentActivitySchema, req.query);
    const data      = await dashboardService.getRecentActivity(req.queryScope, limit);
    return sendSuccess(res, { transactions: data });
  } catch (err) {
    return next(err);
  }
}