import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { generateReport, listReports, getReportById, deleteReport } from '../controllers/reportController.js';

const router = Router();

router.use(authenticate);

router.post('/generate', requirePermission(PERMISSIONS.VIEW_DASHBOARD), generateReport);
router.get('/', requirePermission(PERMISSIONS.VIEW_DASHBOARD), listReports);
router.get('/:id', requirePermission(PERMISSIONS.VIEW_DASHBOARD), getReportById);
router.delete('/:id', deleteReport); // ownership OR manage:users enforced in service

export default router;
