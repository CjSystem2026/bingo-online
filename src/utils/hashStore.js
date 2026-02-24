const crypto = require('crypto');
const fs = require('fs').promises;
const db = require('../config/database');

/**
 * Calcula el hash SHA256 de un archivo.
 */
async function calculateFileHash(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Verifica si un hash ya ha sido procesado.
 */
async function isHashProcessed(hash) {
  const row = await db.getOne(`SELECT hash FROM processed_hashes WHERE hash = ?`, [hash]);
  return !!row;
}

/**
 * Agrega un hash a la base de datos.
 */
async function addProcessedHash(hash) {
  return db.query(`INSERT INTO processed_hashes (hash) VALUES (?)`, [hash]);
}

/**
 * Limpia todos los hashes procesados de la base de datos.
 */
async function clearAllHashes() {
  return db.query(`DELETE FROM processed_hashes`);
}

/**
 * Verifica si un teléfono ya ha usado su prueba.
 */
async function hasUsedTrial(phone) {
  const row = await db.getOne(`SELECT phone FROM used_trials WHERE phone = ?`, [phone]);
  return !!row;
}

/**
 * Registra un teléfono como habiendo usado su prueba.
 * PostgreSQL usa ON CONFLICT DO NOTHING en lugar de INSERT OR IGNORE.
 */
async function registerUsedTrial(phone) {
  const isPostgres = !!process.env.DATABASE_URL;
  const sql = isPostgres 
    ? `INSERT INTO used_trials (phone) VALUES (?) ON CONFLICT (phone) DO NOTHING`
    : `INSERT OR IGNORE INTO used_trials (phone) VALUES (?)`;
  
  return db.query(sql, [phone]);
}

module.exports = {
  calculateFileHash,
  isHashProcessed,
  addProcessedHash,
  clearAllHashes,
  hasUsedTrial,
  registerUsedTrial,
};
