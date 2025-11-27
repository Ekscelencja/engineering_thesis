const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  type: String, // e.g., 'image', 'model', 'furniture'
  url: String,
  name: String,
  metadata: Object
}, { _id: false });

const feedbackSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  comment: String,
  date: { type: Date, default: Date.now }
}, { _id: false });

const vertexSchema = new mongoose.Schema({
  x: { type: Number, required: true },
  z: { type: Number, required: true }
}, { _id: false });

const roomMetadataSchema = new mongoose.Schema({
  name: String,
  type: String,
  area: Number
}, { _id: false });

const projectSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  architect: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assets: [assetSchema],
  status: { type: String, enum: ['draft', 'in_review', 'approved', 'archived'], default: 'draft' },
  feedback: [feedbackSchema],
  // 3D editor state
  globalVertices: [vertexSchema],
  roomVertexIndices: [[Number]],
  roomMetadata: [roomMetadataSchema]
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
