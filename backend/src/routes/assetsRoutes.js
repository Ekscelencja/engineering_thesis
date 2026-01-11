const express = require('express');
const router = express.Router();
const assetsController = require('../controllers/assetsController');

router.get('/furniture', assetsController.getFurnitureAssets);

module.exports = router;