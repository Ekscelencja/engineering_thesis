const mongoose = require('mongoose');

const textureAssetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  file: { type: String, required: true },
  type: { type: String, enum: ['floor', 'wall'], required: true },
  tags: [String],
  previewImage: String
}, { timestamps: true });

module.exports = mongoose.model('TextureAsset', textureAssetSchema);