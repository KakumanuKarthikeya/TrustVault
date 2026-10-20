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
router.get('/me', authenticate, authController.me);

module.exports = router;
