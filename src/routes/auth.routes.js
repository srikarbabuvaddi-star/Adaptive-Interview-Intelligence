const express = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { registerUserSchema } = require('../schemas/auth.schema');

const router = express.Router();

// Real user registration with email & password
router.post('/signup', authController.signup);

// Real user login with email & password
router.post('/login', authController.login);

// Current user profile
router.get('/me', requireAuth, authController.getMe);

// Registers / syncs authenticated Firebase user with role & profile
router.post('/register', requireAuth, validate(registerUserSchema), authController.register);

module.exports = router;
