const db = require('../config/database');

/**
 * Guarda una aprobación de pedido en el historial y actualiza los datos del jugador.
 * @param {Object} orderData 
 * @returns {Promise<void>}
 */
function saveOrderToHistory(orderData) {
  return new Promise((resolve, reject) => {
    const { phone, playerName, operationCode, quantity, isTrial } = orderData;
    
    // 1. Upsert en la tabla 'players'
    const upsertPlayerSql = `
      INSERT INTO players (phone, name, last_seen) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(phone) DO UPDATE SET 
        name = excluded.name, 
        last_seen = CURRENT_TIMESTAMP
    `;

    db.run(upsertPlayerSql, [phone, playerName], function(err) {
      if (err) {
        console.error('[DB] Error al actualizar jugador:', err.message);
        return reject(err);
      }

      // 2. Insertar en 'orders_history'
      const insertOrderSql = `
        INSERT INTO orders_history (phone, playerName, operationCode, quantity, isTrial)
        VALUES (?, ?, ?, ?, ?)
      `;

      db.run(insertOrderSql, [phone, playerName, operationCode, quantity, isTrial], function(err) {
        if (err) {
          console.error('[DB] Error al guardar historial de orden:', err.message);
          return reject(err);
        }
        console.log(`[DB] Orden guardada en historial. ID: ${this.lastID}`);
        resolve();
      });
    });
  });
}

/**
 * Obtiene todo el historial de pedidos aprobados.
 * @returns {Promise<Array>}
 */
function getOrdersHistory() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM orders_history ORDER BY timestamp DESC`;
    db.all(sql, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

/**
 * Obtiene métricas resumidas para el panel de analítica de negocio.
 * @returns {Promise<Object>}
 */
async function getBusinessMetrics() {
  const metrics = {};

  // 1. Ingresos Totales
  metrics.totalRevenue = await new Promise((res, rej) => {
    db.get(`SELECT SUM(quantity * 5) as total FROM orders_history WHERE isTrial = 0`, [], (err, row) => {
      if (err) rej(err); else res(row ? (row.total || 0) : 0);
    });
  });

  // 2. Total de Ventas (Pedidos Aprobados)
  metrics.totalSales = await new Promise((res, rej) => {
    db.get(`SELECT COUNT(*) as total FROM orders_history WHERE isTrial = 0`, [], (err, row) => {
      if (err) rej(err); else res(row ? (row.total || 0) : 0);
    });
  });

  // 3. Total de Pruebas Gratis Usadas (Unicos)
  metrics.totalTrials = await new Promise((res, rej) => {
    db.get(`SELECT COUNT(*) as total FROM used_trials`, [], (err, row) => {
      if (err) rej(err); else res(row ? (row.total || 0) : 0);
    });
  });

  // 4. Usuarios Convertidos (Usaron prueba y luego compraron)
  metrics.convertedUsers = await new Promise((res, rej) => {
    const sql = `
      SELECT COUNT(DISTINCT t.phone) as total 
      FROM used_trials t
      JOIN orders_history o ON t.phone = o.phone
      WHERE o.isTrial = 0
    `;
    db.get(sql, [], (err, row) => {
      if (err) rej(err); else res(row ? (row.total || 0) : 0);
    });
  });

  // 5. Ventas por Hora
  metrics.salesByHour = await new Promise((res, rej) => {
    const sql = `
      SELECT strftime('%H:00', timestamp) as hour, COUNT(*) as count 
      FROM orders_history 
      WHERE isTrial = 0 
      GROUP BY hour 
      ORDER BY hour
    `;
    db.all(sql, [], (err, rows) => {
      if (err) rej(err); else res(rows || []);
    });
  });

  return metrics;
}

module.exports = {
  saveOrderToHistory,
  getOrdersHistory,
  getBusinessMetrics
};
