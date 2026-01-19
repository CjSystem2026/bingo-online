const express = require('express');
const router = express.Router();
const path = require('node:path');

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'landing.html'));
});

router.get('/jugar', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'index.html'));
});

module.exports = router;
