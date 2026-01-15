const FurnitureAsset = require('../models/FurnitureAsset');
const TextureAsset = require('../models/TextureAsset'); 
const fs = require('fs');
const path = require('path');

exports.getFurnitureAssets = (req, res) => {
  const assetsDir = path.join(__dirname, '../../../frontend/src/assets/3d_glb_models');
  
  fs.readdir(assetsDir, (err, files) => {
    if (err) {
      console.error('Error reading furniture assets directory:', err);
      return res.status(500).json({ error: err.message });
    }
    
    const glbFiles = files.filter(f => f.endsWith('.glb'));
    const assets = glbFiles.map(file => {
      const nameWithoutExt = file.replace('.glb', '');
      return {
        _id: nameWithoutExt,
        name: nameWithoutExt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        folder: '3d_glb_models',
        glb: file,
        scale: 1
      };
    });
    
    res.json(assets);
  });
};

exports.getTextureAssets = (req, res) => {
  const type = req.query.type; // 'wall' or 'floor'
  const dir = path.join(__dirname, `../../../frontend/src/assets/textures/${type === 'floor' ? 'floors' : 'walls'}`);
  fs.readdir(dir, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    const textures = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f)).map(file => ({
      name: file.replace(/\.(jpg|jpeg|png)$/i, ''),
      file: file,
      url: `/assets/textures/${type === 'floor' ? 'floors' : 'walls'}/${file}`
    }));
    res.json(textures);
  });
};