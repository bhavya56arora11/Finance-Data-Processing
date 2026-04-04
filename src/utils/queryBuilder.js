// Filter Builder ─

/**
 * Constructs a MongoDB filter from transaction query parameters.
 * All parameters are optional — only sets filter keys that were supplied.
 *
 * @param {object} params
 * @param {string}   [params.search]        - Full-text search string
 * @param {string}   [params.type]          - Exact match on type
 * @param {string}   [params.subtype]       - Exact match on subtype
 * @param {string}   [params.category]      - Case-insensitive partial match
 * @param {string}   [params.status]        - Exact match
 * @param {string}   [params.department]    - Exact match
 * @param {string}   [params.project]       - Exact match
 * @param {string[]} [params.tags]          - $in match
 * @param {string}   [params.from]          - date >= ISO string
 * @param {string}   [params.to]            - date <= ISO string
 * @param {number}   [params.minAmount]     - amount >=
 * @param {number}   [params.maxAmount]     - amount <=
 * @param {string}   [params.currency]      - Exact match
 * @param {number}   [params.fiscalYear]    - Exact match
 * @param {number}   [params.fiscalQuarter] - Exact match
 * @param {string}   [params.createdBy]     - ObjectId string
 * @returns {object} MongoDB filter object
 */
export function buildTransactionFilter({
  search,
  type,
  subtype,
  category,
  status,
  department,
  project,
  tags,
  from,
  to,
  minAmount,
  maxAmount,
  currency,
  fiscalYear,
  fiscalQuarter,
  createdBy,
} = {}) {
  const filter = {};

  // Full-text search (requires text index on the model)
  if (search) {
    filter.$text = { $search: search };
  }

  // Exact string matches
  if (type) filter.type = type;
  if (subtype) filter.subtype = subtype;
  if (status) filter.status = status;
  if (department) filter.department = department;
  if (project) filter.project = project;
  if (currency) filter.currency = currency.toUpperCase();
  if (createdBy) filter.createdBy = createdBy;

  // Numeric exact matches
  if (fiscalYear) filter.fiscalYear = Number(fiscalYear);
  if (fiscalQuarter) filter.fiscalQuarter = Number(fiscalQuarter);

  // Category: exact ObjectId match
  if (category) {
    filter.category = category;
  }

  // Tags: match if the transaction has ANY of the requested tags
  if (tags && tags.length > 0) {
    filter.tags = { $in: Array.isArray(tags) ? tags : [tags] };
  }

  // Date range
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }

  // Amount range
  if (minAmount !== undefined || maxAmount !== undefined) {
    filter.amount = {};
    if (minAmount !== undefined) filter.amount.$gte = Number(minAmount);
    if (maxAmount !== undefined) filter.amount.$lte = Number(maxAmount);
  }

  return filter;
}

// Sort Builder 

const ALLOWED_SORT_FIELDS = new Set([
  'date', 'amount', 'createdAt', 'updatedAt', 'status', 'type', 'category', 'fiscalYear',
]);

/**
 * Builds a Mongoose-compatible sort object.
 *
 * @param {string} [sortBy='date']
 * @param {string} [sortOrder='desc']
 * @returns {object}
 */
// When search is active and no explicit sort, sort by text relevance
export function buildSort(sortBy = 'date', sortOrder = 'desc', hasSearch = false) {
  if (hasSearch && !sortBy) return { score: { $meta: 'textScore' } };
  const field = ALLOWED_SORT_FIELDS.has(sortBy) ? sortBy : 'date';
  const order = sortOrder === 'asc' ? 1 : -1;
  return { [field]: order };
}

// Pagination ──

/**
 * Converts page/limit into skip/limit values for Mongoose queries.
 *
 * @param {number} [page=1]
 * @param {number} [limit=20]
 * @returns {{ skip: number, limit: number }}
 */
export function buildPagination(page = 1, limit = 20) {
  const safePage = Math.max(1, Number(page));
  const safeLimit = Math.min(100, Math.max(1, Number(limit)));
  return { skip: (safePage - 1) * safeLimit, limit: safeLimit };
}
