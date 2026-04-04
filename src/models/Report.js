import mongoose from 'mongoose';

const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    title: { type: String, trim: true },
    type: {
      type: String,
      enum: { values: ['monthly', 'quarterly', 'annual', 'custom'], message: '{VALUE} is not valid' },
      required: [true, 'Report type is required'],
    },
    generatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    period: {
      from:          { type: Date, required: true },
      to:            { type: Date, required: true },
      fiscalYear:    Number,
      fiscalQuarter: Number,
      month:         Number,
    },

    filters: {
      categories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
      types:      [String],
      department: String,
      status:     String,
    },

    data: {
      summary:           Schema.Types.Mixed,
      trends:            Schema.Types.Mixed,
      categoryBreakdown: Schema.Types.Mixed,
      topTransactions:   Schema.Types.Mixed,
      transactionCount:  Number,
    },

    status: {
      type: String,
      enum: ['generating', 'ready', 'failed'],
      default: 'generating',
    },
    error: { type: String, default: null },
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

reportSchema.index({ generatedBy: 1, createdAt: -1 });
reportSchema.index({ type: 1, 'period.from': 1, 'period.to': 1 });

const Report = mongoose.model('Report', reportSchema);
export default Report;
