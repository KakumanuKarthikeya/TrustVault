const express = require('express');
const { rateLimit } = require('express-rate-limit');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/authenticate');
const validateRequest = require('../middleware/validateRequest');

const router = express.Router();
const authenticationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts' },
});
const passwordResetRequestRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests' },
});
const passwordResetConfirmRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts' },
});

router.post(
  '/register',
  authenticationRateLimit,
  validateRequest(authController.registerSchema),
  authController.register,
);
router.post(
  '/login',
  authenticationRateLimit,
  validateRequest(authController.loginSchema),
  authController.login,
);
router.post(
  '/forgot-password',
  passwordResetRequestRateLimit,
  validateRequest(authController.requestPasswordResetSchema),
  authController.requestPasswordReset,
);
router.post(
  '/reset-password',
  passwordResetConfirmRateLimit,
  validateRequest(authController.resetPasswordSchema),
  authController.resetPassword,
);
router.get('/me', authenticate, authController.me);
router.post('/logout', authenticate, authController.logout);

module.exports = router;
