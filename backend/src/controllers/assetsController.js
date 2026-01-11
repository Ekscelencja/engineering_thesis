const FurnitureAsset = require('../models/FurnitureAsset');
const TextureAsset = require('../models/TextureAsset'); 
const fs = require('fs');
const path = require('path');

exports.getFurnitureAssets = (req, res) => {
  const dir = path.join(__dirname, '../../../frontend/src/assets/3d_objects');
  fs.readdir(dir, (err, folders) => {
    if (err) {
      console.error('[API] Error reading furniture assets:', err);
      return res.status(500).json({ error: err.message });
    }
    const assets = folders
      .filter(f => fs.statSync(path.join(dir, f)).isDirectory())
      .map(folder => {
        const files = fs.readdirSync(path.join(dir, folder));
        let meta = {};
        const metaPath = path.join(dir, folder, 'meta.json');
        if (fs.existsSync(metaPath)) {
          try {
            meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          } catch (e) {
            console.warn(`Could not parse meta.json for ${folder}:`, e);
          }
        }
        return {
          name: meta.name || folder,
          folder,
          obj: files.find(f => f.endsWith('.obj')) || null,
          mtl: files.find(f => f.endsWith('.mtl')) || null,
          scale: meta.scale || 1,
          tags: meta.tags || [],
          previewImage: meta.previewImage || null
        };
      });
    res.json(assets);
  });
};