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

module.exports = db;
