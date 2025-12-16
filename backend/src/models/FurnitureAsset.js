const mongoose = require('mongoose');

const furnitureAssetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  folder: { type: String, required: true },
  obj: { type: String, required: true },
  mtl: { type: String },
  scale: { type: Number, default: 1 },
}, { timestamps: true });

module.exports = mongoose.model('FurnitureAsset', furnitureAssetSchema);