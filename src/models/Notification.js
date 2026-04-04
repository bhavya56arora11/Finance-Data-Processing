import mongoose from 'mongoose';

const { Schema } = mongoose;

const NOTIFICATION_TYPES = [
  'TRANSACTION_APPROVED',
  'TRANSACTION_REJECTED',
  'TRANSACTION_PENDING',
  'ROLE_CHANGED',
  'REPORT_READY',
  'REPORT_FAILED',
  'ACCOUNT_STATUS_CHANGED',
];

const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: { values: NOTIFICATION_TYPES, message: '{VALUE} is not a valid notification type' },
      required: true,
    },
    title:   { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    data: {
      resourceType: String,
      resourceId:   Schema.Types.ObjectId,
    },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
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

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
export { NOTIFICATION_TYPES };
export default Notification;