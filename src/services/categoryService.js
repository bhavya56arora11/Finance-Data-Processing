import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import * as auditService from './auditService.js';
import { NotFoundError, ConflictError, OperationNotPermittedError } from '../errors/errorTypes.js';

// List categories, optionally filtered by type and isActive
export async function listCategories({ type, isActive = true } = {}) {
  const filter = {};
  if (isActive !== undefined && isActive !== 'all') filter.isActive = isActive === true || isActive === 'true';
  if (type && type !== 'all') filter.type = type;

  const categories = await Category.find(filter).sort({ type: 1, name: 1 }).lean();

  // Group by type for convenience
  const grouped = { income: [], expense: [], both: [] };
  for (const cat of categories) {
    if (grouped[cat.type]) grouped[cat.type].push(cat);
  }

  return { categories, grouped };
}

// Create a new category
export async function createCategory(data, reqUser, requestId) {
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const existing = await Category.findOne({ slug });
  if (existing) throw new ConflictError(`Category "${data.name}" already exists`);

  const category = await Category.create({ ...data, createdBy: reqUser.id });

  await auditService.log({
    action: 'CREATE_CATEGORY', performedBy: reqUser.id,
    targetResource: 'Category', targetId: category._id, requestId,
  });

  return category.toJSON();
}

// Update a category
export async function updateCategory(id, updates, reqUser, requestId) {
  const category = await Category.findById(id);
  if (!category) throw new NotFoundError('Category');

  // Protect default categories — can only change icon, color, isActive
  if (category.isDefault) {
    const forbidden = Object.keys(updates).filter((k) => !['icon', 'color', 'isActive'].includes(k));
    if (forbidden.length > 0) {
      throw new OperationNotPermittedError(`Cannot modify ${forbidden.join(', ')} on default categories`);
    }
  }

  const before = { name: category.name, type: category.type, color: category.color, isActive: category.isActive };

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) category[key] = value;
  }

  // Slug conflict check if name changed
  if (updates.name) {
    const newSlug = updates.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const conflict = await Category.findOne({ slug: newSlug, _id: { $ne: id } });
    if (conflict) throw new ConflictError(`Category "${updates.name}" already exists`);
  }

  await category.save();

  await auditService.log({
    action: 'UPDATE_CATEGORY', performedBy: reqUser.id,
    targetResource: 'Category', targetId: category._id,
    changes: { before, after: { name: category.name, type: category.type, color: category.color, isActive: category.isActive } },
    requestId,
  });

  return category.toJSON();
}

// Hard-delete a category (cannot delete defaults or referenced ones)
export async function deleteCategory(id, reqUser, requestId) {
  const category = await Category.findById(id);
  if (!category) throw new NotFoundError('Category');

  if (category.isDefault) {
    throw new OperationNotPermittedError('Default categories cannot be deleted');
  }

  const refCount = await Transaction.countDocuments({ category: id });
  if (refCount > 0) {
    throw new ConflictError(`Cannot delete category — ${refCount} transaction(s) reference it`);
  }

  await Category.deleteOne({ _id: id });

  await auditService.log({
    action: 'DELETE_CATEGORY', performedBy: reqUser.id,
    targetResource: 'Category', targetId: category._id, requestId,
  });
}
