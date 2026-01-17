const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');

// Register endpoint
router.post('/register', userController.register);

// Login endpoint
router.post('/login', userController.login);

// List users
router.get('/', auth, userController.listUsers);

module.exports = router;
