import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '../constants/roles.js';

const { Schema } = mongoose;

// ─── Schema ───────────────────────────────────────────────────────────────────

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },

    // select: false ensures password is NEVER returned in queries unless explicitly requested
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },

    role: {
      type: String,
      enum: {
        values: Object.values(ROLES),
        message: '{VALUE} is not a valid role',
      },
      default: ROLES.VIEWER,
    },

    status: {
      type: String,
      enum: {
        values: ['active', 'inactive', 'suspended'],
        message: '{VALUE} is not a valid status',
      },
      default: 'active',
    },

    // Used by viewer scoping: a viewer can only see transactions in their department
    department: {
      type: String,
      trim: true,
      default: null,
    },

    // For external_auditor: the specific transaction ObjectIds they are allowed to access
    scopedRecords: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Transaction',
      },
    ],

    lastLoginAt: {
      type: Date,
      default: null,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: {
      // Strip __v and transform _id → id in JSON output
      versionKey: false,
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.password; // extra safety: never let password slip into JSON
        return ret;
      },
    },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// email index is implicit from unique: true
// Additional query patterns
userSchema.index({ role: 1, status: 1 });
userSchema.index({ department: 1 });

// ─── Pre-save Hook — Password Hashing ────────────────────────────────────────

userSchema.pre('save', async function hashPassword(next) {
  // Only hash if the password field was actually modified
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (err) {
    return next(err);
  }
});

// ─── Instance Methods ─────────────────────────────────────────────────────────

/**
 * Safely compares a plaintext candidate password against the stored hash.
 * Returns false rather than throwing if the password field is unavailable.
 *
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  // this.password may be undefined if the document was queried without +password
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── Static Methods ───────────────────────────────────────────────────────────

/**
 * Find a user by email, explicitly selecting the password field.
 * Used only in the login flow; the rest of the app never needs the hash.
 *
 * @param {string} email
 * @returns {Promise<import('mongoose').HydratedDocument<User> | null>}
 */
userSchema.statics.findByEmail = function findByEmail(email) {
  return this.findOne({ email: email.toLowerCase().trim() }).select('+password');
};

// ─── Model ────────────────────────────────────────────────────────────────────

const User = mongoose.model('User', userSchema);

export default User;
