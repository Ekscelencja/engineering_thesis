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

const WallFeatureSchema = new mongoose.Schema({
  type: { type: String, enum: ['window', 'door'], required: true },
  position: Number,
  width: Number,
  height: Number,
  y: Number
}, { _id: false });

const wallAppearanceSchema = new mongoose.Schema({
  front: { color: String, texture: String },
  back: { color: String, texture: String },
  side: { color: String, texture: String },
  top: { color: String, texture: String },
  bottom: { color: String, texture: String },
  hole: { color: String, texture: String }
}, { _id: false });

const roomMetadataSchema = new mongoose.Schema({
  name: String,
  type: String,
  area: Number,
  color: Number,
  wallFeatures: [[WallFeatureSchema]]
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
  roomMetadata: [roomMetadataSchema],
  wallAppearance: {
    type: Map,
    of: wallAppearanceSchema,
    default: {}
  },
  editorStep: { type: Number, default: 1, min: 1, max: 3 } // 1=Rooms, 2=Walls&Features, 3=Furnishing
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
