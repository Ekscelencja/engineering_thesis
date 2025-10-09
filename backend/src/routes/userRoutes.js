const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Register endpoint
router.post('/register', userController.register);

// Login endpoint
router.post('/login', userController.login);

// Get user profile
router.get('/:id', userController.getProfile);

// Update user profile
router.put('/:id', userController.updateProfile);

// Delete user
router.delete('/:id', userController.deleteUser);

// List users
router.get('/', userController.listUsers);

module.exports = router;
