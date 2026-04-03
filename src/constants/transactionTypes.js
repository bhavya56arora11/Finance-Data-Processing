/**
 * Transaction type and subtype registry.
 * All validity checks flow through the exported helpers — never duplicate these strings elsewhere.
 */

export const TRANSACTION_TYPES = {
  INCOME:     'income',
  EXPENSE:    'expense',
  TRANSFER:   'transfer',
  LIABILITY:  'liability',
  ASSET:      'asset',
  ADJUSTMENT: 'adjustment',
};

export const TRANSACTION_SUBTYPES = {
  [TRANSACTION_TYPES.INCOME]: [
    'salary',
    'freelance',
    'investment_return',
    'grant',
    'rental_income',
    'refund',
    'other',
  ],
  [TRANSACTION_TYPES.EXPENSE]: [
    'operational',
    'payroll',
    'tax',
    'utility',
    'subscription',
    'travel',
    'equipment',
    'other',
  ],
  [TRANSACTION_TYPES.TRANSFER]: [
    'internal_transfer',
    'bank_transfer',
    'currency_exchange',
  ],
  [TRANSACTION_TYPES.LIABILITY]: [
    'loan_taken',
    'credit_used',
  ],
  [TRANSACTION_TYPES.ASSET]: [
    'asset_purchase',
    'depreciation',
  ],
  [TRANSACTION_TYPES.ADJUSTMENT]: [
    'write_off',
    'correction',
    'reconciliation',
  ],
};

export const TRANSACTION_STATUSES = {
  DRAFT:            'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED:         'approved',
  REJECTED:         'rejected',
  VOIDED:           'voided',
};

// ─── Validation Helpers ────────────────────────────────────────────────────────

/**
 * @param {string} type
 * @returns {boolean}
 */
export function isValidType(type) {
  return Object.values(TRANSACTION_TYPES).includes(type);
}

/**
 * Validates that a subtype belongs to its parent type.
 * If no subtype is provided, returns true (subtype is optional).
 *
 * @param {string} type
 * @param {string} subtype
 * @returns {boolean}
 */
export function isValidSubtype(type, subtype) {
  if (!subtype) return true;
  const validSubtypes = TRANSACTION_SUBTYPES[type];
  if (!validSubtypes) return false;
  return validSubtypes.includes(subtype);
}

/**
 * @param {string} status
 * @returns {boolean}
 */
export function isValidStatus(status) {
  return Object.values(TRANSACTION_STATUSES).includes(status);
}
