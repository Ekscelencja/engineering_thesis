const Notification = require('../models/Notification');
const Project = require('../models/Project');

// Create a new feedback notification
exports.createFeedback = async (req, res) => {
  try {
    const { projectId, elementType, elementId, position, message } = req.body;
    const authorId = req.user.id;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Target user is the architect of the project
    const targetUser = project.architect;

    const notification = new Notification({
      project: projectId,
      author: authorId,
      targetUser,
      elementType,
      elementId,
      position,
      message,
      status: 'pending'
    });

    await notification.save();
    res.status(201).json(notification);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all feedback for a project
exports.getFeedbackByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const notifications = await Notification.find({ project: projectId })
      .populate('author', 'name email')
      .populate('resolvedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all feedback for the current user (as author or target)
exports.getMyFeedback = async (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = await Notification.find({
      $or: [{ author: userId }, { targetUser: userId }]
    })
      .populate('project', 'title')
      .populate('author', 'name email')
      .populate('targetUser', 'name email')
      .populate('resolvedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Mark feedback as resolved
exports.resolveFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    notification.status = 'resolved';
    notification.resolvedAt = new Date();
    notification.resolvedBy = userId;

    await notification.save();
    res.json(notification);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete feedback
exports.deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByIdAndDelete(id);
    if (!notification) {
      return res.status(404).json({ error: 'Feedback not found' });
    }
    res.json({ message: 'Feedback deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};