import mongoose from 'mongoose';

const { Schema } = mongoose;

// ─── Schema ───────────────────────────────────────────────────────────────────

const auditLogSchema = new Schema(
  {
    // Describes what happened: 'CREATE_TRANSACTION', 'LOGIN', 'ROLE_CHANGE', etc.
    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
      uppercase: true,
    },

    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'performedBy is required'],
    },

    // The Mongoose model name of the affected document
    targetResource: {
      type: String,
      trim: true,
      default: null,
    },

    // The _id of the affected document
    targetId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    // Before/after snapshot. Using Mixed to stay flexible across different resource types.
    changes: {
      type: Schema.Types.Mixed,
      default: null,
    },

    // Request metadata for security auditing
    ipAddress:  { type: String, default: null },
    userAgent:  { type: String, default: null },
    requestId:  { type: String, default: null },

    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // No updatedAt needed — audit logs are immutable once written
    timestamps: false,
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

// Query pattern: "show me all actions performed by user X, newest first"
auditLogSchema.index({ performedBy: 1, timestamp: -1 });

// Query pattern: "show me all changes to this specific transaction"
auditLogSchema.index({ targetResource: 1, targetId: 1, timestamp: -1 });

// Query pattern: "show all actions of type X in a time window"
auditLogSchema.index({ action: 1, timestamp: -1 });

// TTL index could be added here in Phase 2 for automatic log rotation:
// auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

// ─── Model ────────────────────────────────────────────────────────────────────

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
