const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const auth = require('../middleware/auth');

// Create feedback
router.post('/feedback', auth, notificationController.createFeedback);

// Get feedback for a specific project
router.get('/feedback/project/:projectId', auth, notificationController.getFeedbackByProject);

// Get all feedback for the current user
router.get('/feedback/me', auth, notificationController.getMyFeedback);

// Mark feedback as resolved
router.patch('/feedback/:id/resolve', auth, notificationController.resolveFeedback);

// Delete feedback
router.delete('/feedback/:id', auth, notificationController.deleteFeedback);

module.exports = router;