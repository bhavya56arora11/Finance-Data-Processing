import { z } from 'zod';
import * as categoryService from '../services/categoryService.js';
import { sendSuccess } from '../utils/responseFormatter.js';
import { ValidationError } from '../errors/errorTypes.js';

const createSchema = z.object({
  name:  z.string({ required_error: 'Name is required' }).trim().min(2, 'Name must be at least 2 chars'),
  type:  z.enum(['income', 'expense', 'both'], { required_error: 'Type is required' }),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be valid hex color').optional(),
  icon:  z.string().trim().optional(),
});

const updateSchema = z.object({
  name:     z.string().trim().min(2).optional(),
  type:     z.enum(['income', 'expense', 'both']).optional(),
  color:    z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be valid hex color').optional(),
  icon:     z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })));
  }
  return result.data;
}

export async function listCategories(req, res, next) {
  try {
    const { type, isActive } = req.query;
    const data = await categoryService.listCategories({ type, isActive });
    return sendSuccess(res, data);
  } catch (err) { return next(err); }
}

export async function createCategory(req, res, next) {
  try {
    const body = validate(createSchema, req.body);
    const cat = await categoryService.createCategory(body, req.user, req.id);
    return sendSuccess(res, { category: cat }, 'Category created', 201);
  } catch (err) { return next(err); }
}

export async function updateCategory(req, res, next) {
  try {
    const body = validate(updateSchema, req.body);
    const cat = await categoryService.updateCategory(req.params.id, body, req.user, req.id);
    return sendSuccess(res, { category: cat }, 'Category updated');
  } catch (err) { return next(err); }
}

export async function deleteCategory(req, res, next) {
  try {
    await categoryService.deleteCategory(req.params.id, req.user, req.id);
    return sendSuccess(res, null, 'Category deleted');
  } catch (err) { return next(err); }
}
