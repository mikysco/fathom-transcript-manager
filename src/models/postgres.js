const { Pool } = require('pg');
require('dotenv').config();

class PostgreSQLDatabase {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  }

  async connect() {
    try {
      const client = await this.pool.connect();
      console.log('Connected to PostgreSQL database');
      client.release();
      return true;
    } catch (error) {
      console.error('Error connecting to PostgreSQL:', error);
      return false;
    }
  }

  async createTables() {
    const tables = [
      // Meetings table to store Fathom meeting data
      `CREATE TABLE IF NOT EXISTS meetings (
        id SERIAL PRIMARY KEY,
        fathom_meeting_id TEXT UNIQUE,
        title TEXT,
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        duration INTEGER,
        recording_url TEXT,
        transcript TEXT,
        summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Meeting participants table
      `CREATE TABLE IF NOT EXISTS meeting_participants (
        id SERIAL PRIMARY KEY,
        meeting_id INTEGER,
        name TEXT,
        email TEXT,
        domain TEXT,
        is_host BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
      )`,
      
      // Create indexes for better performance
      `CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time)`,
      `CREATE INDEX IF NOT EXISTS idx_meetings_title ON meetings(title)`,
      `CREATE INDEX IF NOT EXISTS idx_participants_email ON meeting_participants(email)`,
      `CREATE INDEX IF NOT EXISTS idx_participants_domain ON meeting_participants(domain)`,
      `CREATE INDEX IF NOT EXISTS idx_participants_name ON meeting_participants(name)`
    ];

    try {
      for (const table of tables) {
        await this.pool.query(table);
      }
      console.log('PostgreSQL tables created successfully');
    } catch (error) {
      console.error('Error creating PostgreSQL tables:', error);
      throw error;
    }
  }

  async query(text, params = []) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  async get(text, params = []) {
    const result = await this.query(text, params);
    return result.rows[0] || null;
  }

  async all(text, params = []) {
    const result = await this.query(text, params);
    return result.rows;
  }

  async run(text, params = []) {
    const result = await this.query(text, params);
    return result.rowCount;
  }

  async close() {
    await this.pool.end();
    console.log('PostgreSQL connection closed');
  }

  // Get database statistics
  async getStats() {
    try {
      const meetingCount = await this.get('SELECT COUNT(*) as count FROM meetings');
      const participantCount = await this.get('SELECT COUNT(*) as count FROM meeting_participants');
      const domainCount = await this.get('SELECT COUNT(DISTINCT domain) as count FROM meeting_participants WHERE domain IS NOT NULL');
      
      return {
        meetings: meetingCount?.count || 0,
        participants: participantCount?.count || 0,
        uniqueDomains: domainCount?.count || 0
      };
    } catch (error) {
      console.error('Error getting database stats:', error);
      return { meetings: 0, participants: 0, uniqueDomains: 0 };
    }
  }
}

module.exports = PostgreSQLDatabase;
