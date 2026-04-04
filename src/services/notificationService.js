import Notification from '../models/Notification.js';

// Fire-and-forget — callers should .catch() but never await
export async function notify({ recipient, type, title, message, data }) {
  await Notification.create({ recipient, type, title, message, data });
}

// Get paginated notifications for a user
export async function listNotifications(userId, { isRead, page = 1, limit = 20 } = {}) {
  const filter = { recipient: userId };
  if (isRead === 'true' || isRead === true)  filter.isRead = true;
  if (isRead === 'false' || isRead === false) filter.isRead = false;

  const skip = (page - 1) * limit;
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: userId, isRead: false }),
  ]);

  return {
    notifications, unreadCount, total,
    page, totalPages: Math.ceil(total / limit),
  };
}

// Mark single notification as read
export async function markAsRead(notificationId, userId) {
  const notification = await Notification.findById(notificationId);
  if (!notification) return null;
  if (notification.recipient.toString() !== userId) return 'forbidden';

  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();
  return notification.toJSON();
}

// Mark all unread as read for a user
export async function markAllAsRead(userId) {
  const result = await Notification.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return result.modifiedCount;
}

// Lightweight unread count
export async function getUnreadCount(userId) {
  return Notification.countDocuments({ recipient: userId, isRead: false });
}
