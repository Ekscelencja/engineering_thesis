const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const auth = require('../middleware/auth');

// Create project
router.post('/', auth, projectController.createProject);
// Get all projects
router.get('/', auth, projectController.getProjects);
// Get single project
router.get('/:id', auth, projectController.getProject);
// Update project
router.put('/:id', auth, projectController.updateProject);
// Delete project
router.delete('/:id', auth, projectController.deleteProject);
// Add feedback/comment
router.post('/:id/feedback', auth, projectController.addFeedback);
// Remove feedback/comment
router.delete('/:id/feedback', auth, projectController.removeFeedback);
// Approve project
router.post('/:id/approve', auth, projectController.approveProject);
// Request changes
router.post('/:id/request-changes', auth, projectController.requestChanges);
// Add asset
router.post('/:id/assets', auth, projectController.addAsset);
// Remove asset
router.delete('/:id/assets', auth, projectController.removeAsset);
// Update asset
router.put('/:id/assets', auth, projectController.updateAsset);

module.exports = router;
