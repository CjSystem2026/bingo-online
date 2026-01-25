const express = require('express');
const router = express.Router();
const path = require('path');
const basicAuth = require('../config/auth');

// Aplicar autenticación a todas las rutas de este archivo
router.use(basicAuth);

/**
 * Sirve el panel de administración estático.
 * El panel ahora consume datos vía JSON desde /api/admin/orders
 */
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin.html'));
});

module.exports = router;
