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
    // Drop existing tables if they exist (for development)
    if (process.env.NODE_ENV !== 'production') {
      try {
        await this.pool.query('DROP TABLE IF EXISTS meeting_participants CASCADE');
        await this.pool.query('DROP TABLE IF EXISTS meetings CASCADE');
        console.log('Dropped existing tables for fresh start');
      } catch (error) {
        console.log('No existing tables to drop:', error.message);
      }
    }

    // Run migrations for existing tables
    await this.runMigrations();

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
        FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE,
        UNIQUE (meeting_id, email)
      )`,
      
      // Sync status table to track last sync time and stats
      `CREATE TABLE IF NOT EXISTS sync_status (
        id SERIAL PRIMARY KEY,
        last_sync_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_meetings_synced INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

  async runMigrations() {
    try {
      // Add unique constraint to meeting_participants if it doesn't exist
      await this.pool.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'meeting_participants_meeting_id_email_key'
          ) THEN
            ALTER TABLE meeting_participants 
            ADD CONSTRAINT meeting_participants_meeting_id_email_key 
            UNIQUE (meeting_id, email);
          END IF;
        END $$;
      `);
      console.log('Migration completed: Added unique constraint to meeting_participants');
    } catch (error) {
      console.log('Migration error (may be expected):', error.message);
    }
  }

  async query(text, params = []) {
    try {
      const res = await this.pool.query(text, params);
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

  // Sync status methods
  async getSyncStatus() {
    try {
      const status = await this.get('SELECT * FROM sync_status ORDER BY created_at DESC LIMIT 1');
      if (!status) {
        // Initialize with default values if no sync status exists
        await this.query(`
          INSERT INTO sync_status (last_sync_time, total_meetings_synced, sync_status)
          VALUES (NOW(), 0, 'never_synced')
        `);
        return {
          last_sync_time: null,
          total_meetings_synced: 0,
          sync_status: 'never_synced'
        };
      }
      return status;
    } catch (error) {
      console.error('Error getting sync status:', error);
      throw error;
    }
  }

  async updateSyncStatus(status, meetingsCount = 0) {
    try {
      await this.query(`
        INSERT INTO sync_status (last_sync_time, total_meetings_synced, sync_status)
        VALUES (NOW(), $1, $2)
      `, [meetingsCount, status]);
    } catch (error) {
      console.error('Error updating sync status:', error);
      throw error;
    }
  }

  async getDashboardMetrics() {
    try {
      // Get total meetings count
      const meetingsResult = await this.get('SELECT COUNT(*) as count FROM meetings');
      
      // Get total unique companies (domains) count
      const companiesResult = await this.get(`
        SELECT COUNT(DISTINCT domain) as count 
        FROM meeting_participants 
        WHERE domain IS NOT NULL AND domain != ''
      `);
      
      // Get last sync status
      const syncStatus = await this.getSyncStatus();
      
      return {
        total_transcripts: meetingsResult?.count || 0,
        total_companies: companiesResult?.count || 0,
        last_sync_time: syncStatus?.last_sync_time,
        sync_status: syncStatus?.sync_status || 'never_synced'
      };
    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      throw error;
    }
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
