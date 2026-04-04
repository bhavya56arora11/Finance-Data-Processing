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

export function isValidType(type) {
  return Object.values(TRANSACTION_TYPES).includes(type);
}

export function isValidSubtype(type, subtype) {
  if (!subtype) return true;
  const validSubtypes = TRANSACTION_SUBTYPES[type];
  if (!validSubtypes) return false;
  return validSubtypes.includes(subtype);
}

export function isValidStatus(status) {
  return Object.values(TRANSACTION_STATUSES).includes(status);
}