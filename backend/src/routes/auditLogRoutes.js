const express = require('express');
const auditLogController = require('../controllers/auditLogController');
const { authenticate } = require('../middleware/authenticate');
const authorizeRoles = require('../middleware/authorizeRoles');

const router = express.Router();

router.use(authenticate, authorizeRoles('admin'));
router.get('/', auditLogController.list);

module.exports = router;
