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

module.exports = db;
