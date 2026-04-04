import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { register, login, refresh, logout, getMe } from '../controllers/authController.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);

// Authenticated — returns current user profile
router.get('/me', authenticate, getMe);

export default router;