import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { listNotifications, markAsRead, markAllAsRead, getUnreadCount } from '../controllers/notificationController.js';

const router = Router();

router.use(authenticate);

router.get('/', listNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);

export default router;