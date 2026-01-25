const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '..', '..', 'db', 'database.sqlite');

// Connect to the database, creating the file if it doesn't exist.
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Create the table for storing hashes if it doesn't already exist.
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS processed_hashes (
    hash TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

db.run(createTableQuery, (err) => {
  if (err) {
    console.error('Error creating table:', err.message);
  } else {
    console.log('Table "processed_hashes" is ready.');
  }
});

// Create table for used trials
const createUsedTrialsTable = `
  CREATE TABLE IF NOT EXISTS used_trials (
    phone TEXT PRIMARY KEY,
    used_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

db.run(createUsedTrialsTable, (err) => {
  if (err) {
    console.error('Error creating table "used_trials":', err.message);
  } else {
    console.log('Table "used_trials" is ready.');
  }
});

// Create table for players (unique users)
const createPlayersTable = `
  CREATE TABLE IF NOT EXISTS players (
    phone TEXT PRIMARY KEY,
    name TEXT,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

db.run(createPlayersTable, (err) => {
  if (err) {
    console.error('Error creating table "players":', err.message);
  } else {
    console.log('Table "players" is ready.');
  }
});

// Create table for orders history (transactions)
const createOrdersHistoryTable = `
  CREATE TABLE IF NOT EXISTS orders_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT,
    playerName TEXT,
    operationCode TEXT,
    quantity INTEGER,
    isTrial BOOLEAN,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (phone) REFERENCES players(phone)
  );
`;

db.run(createOrdersHistoryTable, (err) => {
  if (err) {
    console.error('Error creating table "orders_history":', err.message);
  } else {
    console.log('Table "orders_history" is ready.');
  }
});

module.exports = db;
