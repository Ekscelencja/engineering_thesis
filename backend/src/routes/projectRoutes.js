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
// Archive project
router.patch('/:id/archive', auth, projectController.archiveProject);
// Delete project
router.delete('/:id', auth, projectController.deleteProject);

module.exports = router;
