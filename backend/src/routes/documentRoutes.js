const express = require('express');
const multer = require('multer');
const documentController = require('../controllers/documentController');
const { authenticate } = require('../middleware/authenticate');
const authorizeRoles = require('../middleware/authorizeRoles');
const {
  requireDocumentAccess,
  requireDocumentOwner,
} = require('../middleware/documentAccess');
const { MAX_FILE_SIZE } = require('../utils/uploadValidation');

const router = express.Router();
const uploadFile = multer({
  storage: multer.memoryStorage(),
  preservePath: true,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 3,
    fieldNameSize: 50,
    fieldSize: 4096,
  },
}).single('file');

router.use(authenticate);

router.post(
  '/',
  authorizeRoles('admin', 'owner'),
  uploadFile,
  documentController.upload,
);
router.get('/', documentController.list);
router.get(
  '/:documentId/download',
  ...requireDocumentAccess('read'),
  documentController.download,
);
router.get(
  '/:documentId',
  ...requireDocumentAccess('read'),
  documentController.getMetadata,
);
router.patch(
  '/:documentId',
  ...requireDocumentAccess('edit'),
  documentController.updateMetadata,
);
router.delete(
  '/:documentId',
  requireDocumentOwner,
  documentController.remove,
);

module.exports = router;
