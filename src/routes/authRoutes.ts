import { Router } from 'express';
import {
  exchangeCode,
  preRegister,
  validateRegistrationToken,
  completeRegistration,
  register,
  login,
  forgotPassword,
  validateResetToken,
  resetPassword,
  createSubUser,
  updateSubUser,
  deleteSubUser
} from '../controllers/authController';
import { protect, authorize } from '../middleware/authMiddleware.ts'; // Add .ts explicit extension for resolution safety if needed, or rely on node resolution

const router = Router();

router.post('/exchange-code', exchangeCode);
router.post('/pre-register', preRegister);
router.post('/validate-registration', validateRegistrationToken);
router.post('/complete-registration', completeRegistration);
router.post('/register', register); // Legacy/Deprecated
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.get('/reset-password/:token', validateResetToken);
router.post('/reset-password', resetPassword);

// Sub-users Management (Protected)
router.post('/sub-users', protect, authorize('owner'), createSubUser);
router.put('/sub-users/:id', protect, authorize('owner'), updateSubUser);
router.delete('/sub-users/:id', protect, authorize('owner'), deleteSubUser);

export default router;
