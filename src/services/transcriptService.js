const PostgreSQLDatabase = require('../models/postgres');
const FathomService = require('./fathomService');

class TranscriptService {
  constructor(fathomApiKey, databaseUrl) {
    this.db = new PostgreSQLDatabase(databaseUrl);
    this.fathomService = new FathomService(fathomApiKey);
  }

  async initialize() {
    await this.db.connect();
    await this.db.createTables();
  }

  /**
   * Sync meetings from Fathom to local database
   */
  async syncMeetings(options = {}) {
    try {
      console.log('Starting meeting sync...');
      
      // Get all meetings from Fathom
      const meetings = await this.fathomService.syncAllMeetings(this.db, options);
      
      let syncedCount = 0;

      for (const meeting of meetings) {
        const processedMeeting = this.fathomService.processMeetingData(meeting);
        
        // Insert meeting
        const meetingResult = await this.db.query(`
          INSERT INTO meetings 
          (fathom_meeting_id, title, start_time, end_time, duration, recording_url, transcript, summary)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (fathom_meeting_id) 
          DO UPDATE SET 
            title = EXCLUDED.title,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            duration = EXCLUDED.duration,
            recording_url = EXCLUDED.recording_url,
            transcript = EXCLUDED.transcript,
            summary = EXCLUDED.summary,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `, [
          processedMeeting.fathomId,
          processedMeeting.title,
          processedMeeting.startTime,
          processedMeeting.endTime,
          processedMeeting.duration,
          processedMeeting.recordingUrl,
          processedMeeting.transcript,
          processedMeeting.summary
        ]);

        const meetingId = meetingResult.rows[0].id;

        // Insert participants
        for (const participant of processedMeeting.participants) {
          await this.db.query(`
            INSERT INTO meeting_participants 
            (meeting_id, name, email, domain, is_host)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (meeting_id, email) 
            DO UPDATE SET 
              name = EXCLUDED.name,
              domain = EXCLUDED.domain,
              is_host = EXCLUDED.is_host
          `, [
            meetingId,
            participant.name,
            participant.email,
            participant.domain,
            participant.isHost
          ]);
        }

        syncedCount++;
        if (syncedCount % 10 === 0) {
          console.log(`Processed ${syncedCount} meetings...`);
        }
      }

      console.log(`Sync complete: ${syncedCount} meetings processed`);
      return { synced: syncedCount };
    } catch (error) {
      console.error('Error syncing meetings:', error);
      throw error;
    }
  }

  /**
   * Search transcripts by email address
   */
  async searchByEmail(email, options = {}) {
    try {
      const query = `
        SELECT DISTINCT 
          m.id,
          m.fathom_meeting_id,
          m.title,
          m.start_time,
          m.duration,
          m.transcript,
          m.summary,
          STRING_AGG(DISTINCT CONCAT(mp.name, ' (', mp.email, ')'), ', ') as participants
        FROM meetings m
        JOIN meeting_participants mp ON m.id = mp.meeting_id
        WHERE mp.email = $1
        GROUP BY m.id 
        ORDER BY m.start_time DESC
      `;

      let finalQuery = query;
      const params = [email];
      
      if (options.limit) {
        finalQuery += ` LIMIT $${params.length + 1}`;
        params.push(options.limit);
      }

      const results = await this.db.all(finalQuery, params);
      
      return results.map(row => ({
        id: row.id,
        fathomId: row.fathom_meeting_id,
        title: row.title,
        startTime: row.start_time,
        duration: row.duration,
        transcript: row.transcript,
        summary: row.summary,
        participants: row.participants ? row.participants.split(',') : []
      }));
    } catch (error) {
      console.error('Error searching by email:', error);
      throw error;
    }
  }

  /**
   * Search transcripts by domain
   */
  async searchByDomain(domain, options = {}) {
    try {
      const query = `
        SELECT DISTINCT 
          m.id,
          m.fathom_meeting_id,
          m.title,
          m.start_time,
          m.duration,
          m.transcript,
          m.summary,
          STRING_AGG(DISTINCT CONCAT(mp.name, ' (', mp.email, ')'), ', ') as participants
        FROM meetings m
        JOIN meeting_participants mp ON m.id = mp.meeting_id
        WHERE mp.domain = $1
        GROUP BY m.id 
        ORDER BY m.start_time DESC
      `;

      let finalQuery = query;
      const params = [domain];
      
      if (options.limit) {
        finalQuery += ` LIMIT $${params.length + 1}`;
        params.push(options.limit);
      }

      const results = await this.db.all(finalQuery, params);
      
      return results.map(row => ({
        id: row.id,
        fathomId: row.fathom_meeting_id,
        title: row.title,
        startTime: row.start_time,
        duration: row.duration,
        transcript: row.transcript,
        summary: row.summary,
        participants: row.participants ? row.participants.split(',') : []
      }));
    } catch (error) {
      console.error('Error searching by domain:', error);
      throw error;
    }
  }

  /**
   * Search transcripts by company name
   */
  async searchByCompany(companyName, options = {}) {
    try {
      const query = `
        SELECT DISTINCT 
          m.id,
          m.fathom_meeting_id,
          m.title,
          m.start_time,
          m.duration,
          m.transcript,
          m.summary,
          STRING_AGG(DISTINCT CONCAT(mp.name, ' (', mp.email, ')'), ', ') as participants
        FROM meetings m
        LEFT JOIN meeting_participants mp ON m.id = mp.meeting_id
        WHERE (
          m.title ILIKE $1 OR 
          mp.name ILIKE $2 OR 
          mp.email ILIKE $3
        )
        GROUP BY m.id 
        ORDER BY m.start_time DESC
      `;

      const searchTerm = `%${companyName}%`;
      let finalQuery = query;
      const params = [searchTerm, searchTerm, searchTerm];
      
      if (options.limit) {
        finalQuery += ` LIMIT $${params.length + 1}`;
        params.push(options.limit);
      }

      const results = await this.db.all(finalQuery, params);
      
      return results.map(row => ({
        id: row.id,
        fathomId: row.fathom_meeting_id,
        title: row.title,
        startTime: row.start_time,
        duration: row.duration,
        transcript: row.transcript,
        summary: row.summary,
        participants: row.participants ? row.participants.split(',') : []
      }));
    } catch (error) {
      console.error('Error searching by company:', error);
      throw error;
    }
  }

  /**
   * Get all unique domains from participants
   */
  async getDomains() {
    try {
      const query = `
        SELECT DISTINCT domain, COUNT(*) as meeting_count
        FROM meeting_participants 
        WHERE domain IS NOT NULL
        GROUP BY domain
        ORDER BY meeting_count DESC, domain
      `;

      const results = await this.db.all(query);
      
      return results.map(row => ({
        domain: row.domain,
        meetingCount: row.meeting_count
      }));
    } catch (error) {
      console.error('Error fetching domains:', error);
      throw error;
    }
  }

  /**
   * Get transcript by ID
   */
  async getTranscript(transcriptId) {
    try {
      const query = `
        SELECT 
          m.*,
          STRING_AGG(DISTINCT CONCAT(mp.name, ' (', mp.email, ')'), ', ') as participants
        FROM meetings m
        LEFT JOIN meeting_participants mp ON m.id = mp.meeting_id
        WHERE m.id = $1
        GROUP BY m.id
      `;

      const result = await this.db.get(query, [transcriptId]);
      
      if (!result) {
        return null;
      }

      return {
        id: result.id,
        fathomId: result.fathom_meeting_id,
        title: result.title,
        startTime: result.start_time,
        endTime: result.end_time,
        duration: result.duration,
        recordingUrl: result.recording_url,
        transcript: result.transcript,
        summary: result.summary,
        participants: result.participants ? result.participants.split(',') : []
      };
    } catch (error) {
      console.error('Error fetching transcript:', error);
      throw error;
    }
  }

  /**
   * Concatenate selected transcripts into a single text
   */
  async concatenateTranscripts(transcriptIds) {
    try {
      const placeholders = transcriptIds.map(() => '?').join(',');
      const query = `
        SELECT 
          m.title,
          m.start_time,
          m.transcript,
          GROUP_CONCAT(DISTINCT mp.domain) as domains
        FROM meetings m
        LEFT JOIN meeting_participants mp ON m.id = mp.meeting_id
        WHERE m.id IN (${placeholders})
        GROUP BY m.id
        ORDER BY m.start_time
      `;

      const results = await this.db.all(query, transcriptIds);
      
      let concatenatedText = '';

      for (const transcript of results) {
        const domains = transcript.domains ? transcript.domains.split(',') : [];
        const primaryDomain = domains[0] || 'Unknown Domain';
        
        // Add transcript header
        concatenatedText += `--- ${transcript.title} ---\n`;
        concatenatedText += `Date: ${new Date(transcript.start_time).toLocaleDateString()}\n`;
        concatenatedText += `Domain: ${primaryDomain}\n\n`;
        
        // Add transcript content
        concatenatedText += transcript.transcript || '[No transcript available]';
        concatenatedText += '\n\n';
      }

      return concatenatedText;
    } catch (error) {
      console.error('Error concatenating transcripts:', error);
      throw error;
    }
  }
}

module.exports = TranscriptService;