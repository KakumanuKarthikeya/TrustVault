const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticate } = require('../middleware/authenticate');
const authorizeRoles = require('../middleware/authorizeRoles');

const router = express.Router();

router.use(authenticate, authorizeRoles('admin'));
router.get('/dashboard', adminController.dashboard);
router.get('/users', adminController.listUsers);
router.patch('/users/:userId/status', adminController.updateUserStatus);

module.exports = router;
