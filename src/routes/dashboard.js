import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { scopeFilter } from '../middleware/scopeFilter.js';
import { PERMISSIONS } from '../constants/permissions.js';
import {
  getSummary,
  getCategoryBreakdown,
  getTrends,
  getDepartmentBreakdown,
  getRecentActivity,
} from '../controllers/dashboardController.js';

const router = Router();

// All dashboard routes require authentication + scope resolution
router.use(authenticate);
router.use(scopeFilter);

// available to any role with view:dashboard
router.get('/summary', requirePermission(PERMISSIONS.VIEW_DASHBOARD), getSummary);

router.get('/category-breakdown', requirePermission(PERMISSIONS.VIEW_DASHBOARD), getCategoryBreakdown);

// analyst-level and above
router.get('/trends', requirePermission(PERMISSIONS.VIEW_INSIGHTS), getTrends);

// insights
router.get('/department-breakdown', requirePermission(PERMISSIONS.VIEW_INSIGHTS), getDepartmentBreakdown);

router.get('/recent-activity', requirePermission(PERMISSIONS.VIEW_DASHBOARD), getRecentActivity);

export default router;