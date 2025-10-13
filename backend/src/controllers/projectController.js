const Project = require('../models/Project');
const Notification = require('../models/Notification');

// Helper to create notification
async function createNotification({ user, type, message, project }) {
  const notification = new Notification({ user, type, message, project });
  await notification.save();
}

// Create a new project
exports.createProject = async (req, res) => {
  try {
    const project = new Project({ ...req.body, architect: req.user.id });
    await project.save();
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Enhanced getProjects with advanced filtering
exports.getProjects = async (req, res) => {
  try {
    const filter = {};
    if (req.query.architect) filter.architect = req.query.architect;
    if (req.query.client) filter.client = req.query.client;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    if (req.query.title) filter.title = { $regex: req.query.title, $options: 'i' };
    const projects = await Project.find(filter).populate('architect client feedback.user');
    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get a single project
exports.getProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate('architect client feedback.user');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update a project
exports.updateProject = async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Delete a project
exports.deleteProject = async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Add feedback/comment to a project (with notification)
exports.addFeedback = async (req, res) => {
  try {
    const { comment } = req.body;
    const feedback = {
      user: req.user.id,
      comment,
      date: new Date()
    };
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $push: { feedback } },
      { new: true }
    ).populate('architect client feedback.user');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    // Notify architect
    await createNotification({
      user: project.architect,
      type: 'feedback',
      message: `New feedback from ${req.user.id}: ${comment}`,
      project: project._id
    });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Remove feedback/comment from a project
exports.removeFeedback = async (req, res) => {
  try {
    const { feedbackId } = req.body;
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $pull: { feedback: { _id: feedbackId } } },
      { new: true }
    ).populate('architect client feedback.user');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Approve project (client) (with notification)
exports.approveProject = async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { status: 'approved' },
      { new: true }
    ).populate('architect client feedback.user');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    // Notify architect
    await createNotification({
      user: project.architect,
      type: 'status_change',
      message: `Project approved by client`,
      project: project._id
    });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Request changes (client) (with notification)
exports.requestChanges = async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { status: 'in_review' },
      { new: true }
    ).populate('architect client feedback.user');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    // Notify architect
    await createNotification({
      user: project.architect,
      type: 'status_change',
      message: `Client requested changes to the project`,
      project: project._id
    });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Add asset to a project
exports.addAsset = async (req, res) => {
  try {
    const asset = req.body;
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $push: { assets: asset } },
      { new: true }
    ).populate('architect client feedback.user');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Remove asset from a project
exports.removeAsset = async (req, res) => {
  try {
    const { assetId } = req.body;
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $pull: { assets: { _id: assetId } } },
      { new: true }
    ).populate('architect client feedback.user');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update asset in a project
exports.updateAsset = async (req, res) => {
  try {
    const { assetId, ...updates } = req.body;
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const asset = project.assets.id(assetId);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    Object.assign(asset, updates);
    await project.save();
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Assign/invite client to project
exports.assignClient = async (req, res) => {
  try {
    const { clientId } = req.body;
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { client: clientId },
      { new: true }
    ).populate('architect client feedback.user');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Archive project (soft delete)
exports.archiveProject = async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { status: 'archived' },
      { new: true }
    ).populate('architect client feedback.user');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
