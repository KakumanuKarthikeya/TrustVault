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
const passwordChangeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password change attempts' },
});
const twoFactorLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many two-factor verification attempts' },
});
const twoFactorSetupRequestRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many two-factor setup requests' },
});
const twoFactorSetupVerifyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many two-factor setup verification attempts' },
});
const twoFactorDisableRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many two-factor disable attempts' },
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
router.post(
  '/change-password',
  passwordChangeRateLimit,
  authenticate,
  validateRequest(authController.changePasswordSchema),
  authController.changePassword,
);
router.post(
  '/login/verify-2fa',
  twoFactorLoginRateLimit,
  validateRequest(authController.verifyTwoFactorLoginSchema),
  authController.verifyTwoFactorLogin,
);
router.get('/2fa/status', authenticate, authController.twoFactorStatus);
router.post(
  '/2fa/setup',
  twoFactorSetupRequestRateLimit,
  authenticate,
  authController.setupTwoFactor,
);
router.post(
  '/2fa/verify-setup',
  twoFactorSetupVerifyRateLimit,
  authenticate,
  validateRequest(authController.verifyTwoFactorSetupSchema),
  authController.verifyTwoFactorSetup,
);
router.post(
  '/2fa/disable',
  twoFactorDisableRateLimit,
  authenticate,
  validateRequest(authController.disableTwoFactorSchema),
  authController.disableTwoFactor,
);

module.exports = router;
