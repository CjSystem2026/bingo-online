const db = require('../config/database');

/**
 * Guarda una aprobación de pedido en el historial y actualiza los datos del jugador.
 * @param {Object} orderData 
 * @returns {Promise<void>}
 */
async function saveOrderToHistory(orderData) {
  const { phone, playerName, operationCode, quantity, isTrial } = orderData;
  
  // 1. Upsert en la tabla 'players'
  // SQLite usa ON CONFLICT(phone) DO UPDATE, PostgreSQL también (9.5+)
  const upsertPlayerSql = `
    INSERT INTO players (phone, name, last_seen) 
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(phone) DO UPDATE SET 
      name = EXCLUDED.name, 
      last_seen = CURRENT_TIMESTAMP
  `;

  try {
    await db.query(upsertPlayerSql, [phone, playerName]);
    
    // 2. Insertar en 'orders_history'
    const insertOrderSql = `
      INSERT INTO orders_history (phone, playerName, operationCode, quantity, isTrial)
      VALUES (?, ?, ?, ?, ?)
    `;

    await db.query(insertOrderSql, [phone, playerName, operationCode, quantity, isTrial]);
    console.log(`[DB] Orden guardada en historial para ${phone}.`);
  } catch (err) {
    console.error('[DB] Error guardando en historial:', err.message);
    throw err;
  }
}

/**
 * Obtiene todo el historial de pedidos aprobados.
 * @returns {Promise<Array>}
 */
function getOrdersHistory() {
  return db.query(`SELECT * FROM orders_history ORDER BY timestamp DESC`);
}

/**
 * Obtiene métricas resumidas para el panel de analítica de negocio.
 * @returns {Promise<Object>}
 */
async function getBusinessMetrics() {
  const metrics = {};

  try {
    // 1. Ingresos Totales
    const revenueRow = await db.getOne(`SELECT SUM(quantity * 5) as total FROM orders_history WHERE isTrial = FALSE OR isTrial = 0`);
    metrics.totalRevenue = revenueRow ? (parseFloat(revenueRow.total) || 0) : 0;

    // 2. Total de Ventas (Pedidos Aprobados)
    const salesRow = await db.getOne(`SELECT COUNT(*) as total FROM orders_history WHERE isTrial = FALSE OR isTrial = 0`);
    metrics.totalSales = salesRow ? (parseInt(salesRow.total) || 0) : 0;

    // 3. Total de Pruebas Gratis Usadas (Unicos)
    const trialsRow = await db.getOne(`SELECT COUNT(*) as total FROM used_trials`);
    metrics.totalTrials = trialsRow ? (parseInt(trialsRow.total) || 0) : 0;

    // 4. Usuarios Convertidos (Usaron prueba y luego compraron)
    const sqlConverted = `
      SELECT COUNT(DISTINCT t.phone) as total 
      FROM used_trials t
      JOIN orders_history o ON t.phone = o.phone
      WHERE o.isTrial = FALSE OR o.isTrial = 0
    `;
    const convertedRow = await db.getOne(sqlConverted);
    metrics.convertedUsers = convertedRow ? (parseInt(convertedRow.total) || 0) : 0;

    // 5. Ventas por Hora
    // SQLite usa strftime, Postgres usa to_char o extract. 
    // Como solución rápida, detectamos si es postgres o usamos una query compatible.
    // Usaremos strftime para SQLite y to_char para Postgres
    const isPostgres = !!process.env.DATABASE_URL;
    const hourSql = isPostgres 
      ? `SELECT to_char(timestamp, 'HH24:00') as hour, COUNT(*) as count FROM orders_history WHERE isTrial = FALSE GROUP BY hour ORDER BY hour`
      : `SELECT strftime('%H:00', timestamp) as hour, COUNT(*) as count FROM orders_history WHERE isTrial = 0 GROUP BY hour ORDER BY hour`;
    
    metrics.salesByHour = await db.query(hourSql);

  } catch (err) {
    console.error('[DB] Error obteniendo métricas:', err.message);
    throw err;
  }

  return metrics;
}

module.exports = {
  saveOrderToHistory,
  getOrdersHistory,
  getBusinessMetrics
};
