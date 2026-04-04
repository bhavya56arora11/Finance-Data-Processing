import mongoose from 'mongoose';

const { Schema } = mongoose;

const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // 'income', 'expense', or 'both'
    type: {
      type: String,
      enum: { values: ['income', 'expense', 'both'], message: '{VALUE} is not a valid category type' },
      required: [true, 'Category type is required'],
    },
    icon:      { type: String, trim: true, default: null },
    color:     { type: String, trim: true, default: null, match: [/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex string'] },
    isDefault: { type: Boolean, default: false },
    isActive:  { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
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

// Case-insensitive unique on name
categorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
categorySchema.index({ type: 1, isActive: 1 });

// Auto-generate slug from name before save
categorySchema.pre('save', function generateSlug(next) {
  if (this.isModified('name') || this.isNew) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  next();
});

const Category = mongoose.model('Category', categorySchema);
export default Category;
