const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');

// Register endpoint
router.post('/register', userController.register);

// Login endpoint
router.post('/login', userController.login);

// Get user profile
router.get('/:id', auth, userController.getProfile);

// Update user profile
router.put('/:id', auth, userController.updateProfile);

// Delete user
router.delete('/:id', auth, userController.deleteUser);

// List users
router.get('/', auth, userController.listUsers);

// Change password
router.put('/change-password', auth, userController.changePassword);

module.exports = router;
