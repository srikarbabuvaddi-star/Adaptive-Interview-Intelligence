const express = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { updateProfileSchema } = require('../schemas/user.schema');

const router = express.Router();

// GET /api/users/me
router.get('/me', requireAuth, authController.getMe);

// PATCH /api/users/me
router.patch('/me', requireAuth, validate(updateProfileSchema), authController.updateMe);

module.exports = router;
