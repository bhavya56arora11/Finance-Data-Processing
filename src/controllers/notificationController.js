import { z } from 'zod';
import * as notificationService from '../services/notificationService.js';
import { sendSuccess } from '../utils/responseFormatter.js';
import { ValidationError, AuthorizationError, NotFoundError } from '../errors/errorTypes.js';

const listSchema = z.object({
  isRead: z.enum(['true', 'false', 'all']).default('all'),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(50).default(20),
});

function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })));
  }
  return result.data;
}

// GET /notifications
export async function listNotifications(req, res, next) {
  try {
    const { isRead, page, limit } = validate(listSchema, req.query);
    const data = await notificationService.listNotifications(req.user.id, { isRead: isRead === 'all' ? undefined : isRead, page, limit });
    return sendSuccess(res, {
      notifications: data.notifications,
      unreadCount: data.unreadCount,
      pagination: { total: data.total, page: data.page, totalPages: data.totalPages, limit },
    });
  } catch (err) { return next(err); }
}

// PATCH /notifications/:id/read
export async function markAsRead(req, res, next) {
  try {
    const result = await notificationService.markAsRead(req.params.id, req.user.id);
    if (result === null) throw new NotFoundError('Notification');
    if (result === 'forbidden') throw new AuthorizationError('notifications');
    return sendSuccess(res, { notification: result }, 'Marked as read');
  } catch (err) { return next(err); }
}

// PATCH /notifications/read-all
export async function markAllAsRead(req, res, next) {
  try {
    const count = await notificationService.markAllAsRead(req.user.id);
    return sendSuccess(res, { updatedCount: count }, `${count} notifications marked as read`);
  } catch (err) { return next(err); }
}

// GET /notifications/unread-count
export async function getUnreadCount(req, res, next) {
  try {
    const unreadCount = await notificationService.getUnreadCount(req.user.id);
    return sendSuccess(res, { unreadCount });
  } catch (err) { return next(err); }
}
