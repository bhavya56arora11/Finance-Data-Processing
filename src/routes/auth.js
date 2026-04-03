import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
} from '../controllers/authController.js';

const router = Router();


// creates a new viewer-role account.
router.post('/register', register);

// authenticates credentials, issues tokens.
router.post('/login', login);

// issues new access token using the httpOnly refresh cookie.
router.post('/refresh', refresh);

// clears the refresh token cookie.
router.post('/logout', logout);

export default router;