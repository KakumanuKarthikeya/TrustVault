const express = require('express');
const { rateLimit } = require('express-rate-limit');
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
const lookupRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many account lookups. Try again later.' },
});

router.get('/lookup', authenticate, lookupRateLimit, userController.lookup);

module.exports = router;
