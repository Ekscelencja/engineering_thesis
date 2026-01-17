const express = require('express');
const router = express.Router();
const assetsController = require('../controllers/assetsController');

// Get furniture assets
router.get('/furniture', assetsController.getFurnitureAssets);
// Get texture assets
router.get('/textures', assetsController.getTextureAssets);

module.exports = router;