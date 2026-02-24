const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '..', '..', 'db', 'database.sqlite');
const DATABASE_URL = process.env.DATABASE_URL;

let db;
let isPostgres = false;

if (DATABASE_URL) {
  console.log('[DB] Usando PostgreSQL (Supabase).');
  isPostgres = true;
  db = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Requerido para Supabase
  });
} else {
  console.log('[DB] DATABASE_URL no encontrada. Usando SQLite local.');
  db = new sqlite3.Database(dbPath);
}

/**
 * Wrapper universal para consultas que funciona en SQLite y Postgres.
 * Retorna una Promesa con los resultados.
 */
db.query = function(sql, params = []) {
  // Convertir sintaxis de parámetros si es necesario (SQLite usa ? y Postgres usa $1, $2...)
  let formattedSql = sql;
  if (isPostgres) {
    let i = 1;
    formattedSql = sql.replace(/\?/g, () => `$${i++}`);
  }

  return new Promise((resolve, reject) => {
    if (isPostgres) {
      db.connect()
        .then(client => {
          return client.query(formattedSql, params)
            .then(res => {
              client.release();
              // Normalizar el retorno para que coincida con lo que espera el código
              // Postgres: res.rows para SELECT, res para otros
              // SQLite: row para get, rows para all
              resolve(res.rows);
            })
            .catch(err => {
              client.release();
              reject(err);
            });
        })
        .catch(err => reject(err));
    } else {
      // Determinar si es una consulta con retorno o no
      const isSelect = formattedSql.trim().toUpperCase().startsWith('SELECT');
      if (isSelect) {
        db.all(formattedSql, params, (err, rows) => {
          if (err) reject(err); else resolve(rows);
        });
      } else {
        db.run(formattedSql, params, function(err) {
          if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
        });
      }
    }
  });
};

/**
 * Alias para facilitar la migración de código que usa db.get (un solo registro)
 */
db.getOne = async function(sql, params = []) {
  const rows = await this.query(sql, params);
  return rows.length > 0 ? rows[0] : null;
};

// --- INICIALIZACIÓN DE TABLAS (POSTGRES Y SQLITE) ---

async function initTables() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS processed_hashes (
      hash TEXT PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS used_trials (
      phone TEXT PRIMARY KEY,
      used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS players (
      phone TEXT PRIMARY KEY,
      name TEXT,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS orders_history (
      id SERIAL PRIMARY KEY,
      phone TEXT,
      playerName TEXT,
      operationCode TEXT,
      quantity INTEGER,
      isTrial BOOLEAN,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (let q of queries) {
    // Ajuste de SERIAL para SQLite (aunque INTEGER PRIMARY KEY AUTOINCREMENT es lo ideal en sqlite)
    if (!isPostgres) {
      q = q.replace('SERIAL PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT');
      q = q.replace('TIMESTAMP', 'DATETIME');
    }
    
    try {
      await db.query(q);
    } catch (err) {
      console.error('[DB] Error inicializando tabla:', err.message);
    }
  }
}

initTables();

module.exports = db;
