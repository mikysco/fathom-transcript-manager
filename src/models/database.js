const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor(dbPath = './data/transcripts.db') {
    this.dbPath = dbPath;
    this.db = null;
    
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    const tables = [
      // Meetings table to store Fathom meeting data
      `CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fathom_meeting_id TEXT UNIQUE,
        title TEXT,
        start_time DATETIME,
        end_time DATETIME,
        recording_start_time DATETIME,
        recording_end_time DATETIME,
        duration INTEGER,
        recording_url TEXT,
        transcript TEXT,
        summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Meeting participants table
      `CREATE TABLE IF NOT EXISTS meeting_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id INTEGER,
        name TEXT,
        email TEXT,
        domain TEXT,
        is_host BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (meeting_id) REFERENCES meetings (id)
      )`,
      
      // Create indexes for better performance
      `CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time)`,
      `CREATE INDEX IF NOT EXISTS idx_meetings_title ON meetings(title)`,
      `CREATE INDEX IF NOT EXISTS idx_participants_email ON meeting_participants(email)`,
      `CREATE INDEX IF NOT EXISTS idx_participants_domain ON meeting_participants(domain)`,
      `CREATE INDEX IF NOT EXISTS idx_participants_name ON meeting_participants(name)`
    ];

    for (const table of tables) {
      await this.run(table);
    }
    
    // Migration: Add recording time columns to existing tables
    await this.migrateRecordingTimes();
  }
  
  async migrateRecordingTimes() {
    try {
      // Check if recording_start_time column exists
      const tableInfo = await this.all('PRAGMA table_info(meetings)');
      const hasRecordingStartTime = tableInfo.some(col => col.name === 'recording_start_time');
      
      if (!hasRecordingStartTime) {
        console.log('🔧 Migrating database: Adding recording time columns...');
        await this.run('ALTER TABLE meetings ADD COLUMN recording_start_time DATETIME');
        await this.run('ALTER TABLE meetings ADD COLUMN recording_end_time DATETIME');
        console.log('✅ Migration complete: Recording time columns added');
      }
    } catch (error) {
      console.error('Migration error:', error);
      // Don't throw - allow app to continue even if migration fails
    }
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database connection closed');
          resolve();
        }
      });
    });
  }
}

module.exports = Database;
