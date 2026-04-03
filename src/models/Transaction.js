import mongoose from 'mongoose';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from '../constants/transactionTypes.js';

const { Schema } = mongoose;

// ─── Change History Sub-schema ────────────────────────────────────────────────

const changeHistorySchema = new Schema(
  {
    modifiedBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
    modifiedAt:     { type: Date, default: Date.now },
    changedFields:  [String],
    previousValues: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const transactionSchema = new Schema(
  {
    // ── Financials ───────────────────────────────────────────────────────────
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be at least 0.01'],
    },

    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code'],
    },

    // Stored in base currency (USD) for aggregation consistency.
    // Phase 2 will wire in a real FX conversion service.
    convertedAmount: { type: Number, default: null },
    baseCurrency:    { type: String, default: 'USD', uppercase: true },

    // ── Classification ───────────────────────────────────────────────────────
    type: {
      type: String,
      enum: {
        values: Object.values(TRANSACTION_TYPES),
        message: '{VALUE} is not a valid transaction type',
      },
      required: [true, 'Transaction type is required'],
    },

    subtype: { type: String, trim: true, default: null },

    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      minlength: [2, 'Category must be at least 2 characters'],
    },

    tags: [{ type: String, trim: true }],

    // ── Date & Fiscal Period ─────────────────────────────────────────────────
    date: {
      type: Date,
      required: [true, 'Transaction date is required'],
    },

    // Computed automatically by the pre-save hook — do not set manually
    fiscalYear:    { type: Number },
    fiscalQuarter: { type: Number, min: 1, max: 4 },

    // ── Status & Approval ────────────────────────────────────────────────────
    status: {
      type: String,
      enum: {
        values: Object.values(TRANSACTION_STATUSES),
        message: '{VALUE} is not a valid status',
      },
      default: TRANSACTION_STATUSES.DRAFT,
    },

    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt:  { type: Date, default: null },

    // ── Metadata ─────────────────────────────────────────────────────────────
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
      default: null,
    },

    // Sparse unique: only enforced when a value is actually provided
    referenceNumber: {
      type: String,
      trim: true,
      sparse: true,
      default: null,
    },

    counterparty: { type: String, trim: true, default: null },
    department:   { type: String, trim: true, default: null },
    project:      { type: String, trim: true, default: null },

    // ── Ownership ────────────────────────────────────────────────────────────
    createdBy:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastModifiedBy:  { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Soft Delete ──────────────────────────────────────────────────────────
    isDeleted:  { type: Boolean, default: false },
    deletedAt:  { type: Date, default: null },
    deletedBy:  { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Audit Trail ──────────────────────────────────────────────────────────
    changeHistory: [changeHistorySchema],
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Text index for free-text search across key string fields
transactionSchema.index(
  { notes: 'text', counterparty: 'text', category: 'text', referenceNumber: 'text' },
  { name: 'transaction_text_search' }
);

// Compound indexes for the most common query patterns
transactionSchema.index({ type: 1, date: -1 });
transactionSchema.index({ department: 1, date: -1 });
transactionSchema.index({ status: 1, isDeleted: 1 });
transactionSchema.index({ createdBy: 1, date: -1 });
transactionSchema.index({ fiscalYear: 1, fiscalQuarter: 1 });
transactionSchema.index({ referenceNumber: 1 }, { unique: true, sparse: true });

// ─── Helper — Compute Fiscal Period ──────────────────────────────────────────

/**
 * Fiscal year starts January 1st (calendar year).
 * Quarter mapping: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
 *
 * @param {Date} date
 * @returns {{ fiscalYear: number, fiscalQuarter: number }}
 */
function computeFiscalPeriod(date) {
  const d = new Date(date);
  const fiscalYear = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-indexed
  const fiscalQuarter = Math.floor(month / 3) + 1;
  return { fiscalYear, fiscalQuarter };
}

// ─── Pre-save Hooks ───────────────────────────────────────────────────────────

transactionSchema.pre('save', function computeFiscalFields(next) {
  if (this.isModified('date') || this.isNew) {
    const { fiscalYear, fiscalQuarter } = computeFiscalPeriod(this.date);
    this.fiscalYear = fiscalYear;
    this.fiscalQuarter = fiscalQuarter;
  }
  next();
});

transactionSchema.pre('save', function trackChangeHistory(next) {
  // Only track changes on existing documents (not initial creation)
  if (this.isNew) return next();

  const trackedFields = ['amount', 'currency', 'type', 'subtype', 'category', 'date', 'status', 'notes'];
  const changedFields = trackedFields.filter((f) => this.isModified(f));

  if (changedFields.length === 0) return next();

  // previousValues is populated by the service layer before calling save()
  // to avoid a redundant DB read here
  if (this._previousValues) {
    this.changeHistory.push({
      modifiedBy:     this.lastModifiedBy,
      modifiedAt:     new Date(),
      changedFields,
      previousValues: this._previousValues,
    });
    delete this._previousValues;
  }

  next();
});

// ─── Query Middleware — Soft Delete Filter ────────────────────────────────────

/**
 * Automatically filters out soft-deleted records on all find operations,
 * unless the query explicitly sets `_includeDeleted: true` in its options.
 *
 * Auditors bypass this by setting that option in the service layer.
 */
function softDeleteFilter(next) {
  const opts = this.getOptions();
  if (!opts._includeDeleted) {
    this.where({ isDeleted: false });
  }
  next();
}

transactionSchema.pre('find', softDeleteFilter);
transactionSchema.pre('findOne', softDeleteFilter);
transactionSchema.pre('findOneAndUpdate', softDeleteFilter);
transactionSchema.pre('countDocuments', softDeleteFilter);

// ─── Model ────────────────────────────────────────────────────────────────────

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;
