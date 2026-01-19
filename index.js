require('dotenv').config();
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const path = require('node:path');

// Inicialización
const app = express();
const server = createServer(app);
const io = new Server(server);

// --- RUTAS ---
const apiRoutes = require('./src/routes/api')(io);
const adminRoutes = require('./src/routes/admin');
const viewRoutes = require('./src/routes/views');

// --- MIDDLEWARES Y RUTAS ---
app.use(express.json());
app.use('/', viewRoutes); // Primero las vistas para que '/' sirva el landing
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// --- SOCKETS ---
require('./src/sockets/bingoSocket')(io);

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  =========================================
  🚀 BINGO ONLINE - MODULARIZADO
  =========================================
  🏠 WEB PRINCIPAL: http://localhost:${PORT}
  🛠️ PANEL ADMIN:   http://localhost:${PORT}/admin
  =========================================
  `);
});
