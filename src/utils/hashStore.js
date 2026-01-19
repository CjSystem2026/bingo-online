const crypto = require('crypto');
const fs = require('fs').promises;
const db = require('../config/database');

/**
 * Calculates the SHA256 hash of a file.
 * @param {string} filePath - The absolute path to the file.
 * @returns {Promise<string>} - The SHA256 hash of the file.
 */
async function calculateFileHash(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Checks if a hash has already been processed by querying the database.
 * @param {string} hash - The hash to check.
 * @returns {Promise<boolean>} - True if the hash exists in the DB, false otherwise.
 */
function isHashProcessed(hash) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT hash FROM processed_hashes WHERE hash = ?`;
    db.get(sql, [hash], (err, row) => {
      if (err) {
        return reject(new Error('Database query failed: ' + err.message));
      }
      resolve(!!row); // If a row is found, the hash exists (true). Otherwise, it's false.
    });
  });
}

/**
 * Adds a hash to the database.
 * @param {string} hash - The hash to add.
 * @returns {Promise<void>}
 */
function addProcessedHash(hash) {
  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO processed_hashes (hash) VALUES (?)`;
    db.run(sql, [hash], function(err) {
      if (err) {
        return reject(new Error('Database insert failed: ' + err.message));
      }
      resolve();
    });
  });
}

module.exports = {
  calculateFileHash,
  isHashProcessed,
  addProcessedHash,
};
