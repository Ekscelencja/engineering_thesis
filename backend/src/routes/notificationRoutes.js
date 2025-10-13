const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const auth = require('../middleware/auth');

// List notifications for logged-in user
router.get('/', auth, notificationController.listNotifications);
// Mark notification as read
router.put('/:id/read', auth, notificationController.markAsRead);

module.exports = router;
