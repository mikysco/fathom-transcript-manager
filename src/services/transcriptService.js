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
      // Update sync status to 'in_progress'
      await this.db.updateSyncStatus('in_progress', 0);
      
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
      }

      // Update sync status to 'completed' with count
      await this.db.updateSyncStatus('completed', syncedCount);

      return { synced: syncedCount };
    } catch (error) {
      console.error('Error syncing meetings:', error);
      // Update sync status to 'failed'
      await this.db.updateSyncStatus('failed', 0);
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
          m.title ILIKE $2 OR 
          m.title ILIKE $3 OR
          mp.name ILIKE $4 OR 
          mp.email ILIKE $5 OR
          mp.domain ILIKE $6
        )
        GROUP BY m.id 
        ORDER BY m.start_time DESC
      `;

      // Create multiple search variations to catch more matches
      const searchTerm = `%${companyName}%`;
      const searchTermLower = `%${companyName.toLowerCase()}%`;
      const searchTermUpper = `%${companyName.toUpperCase()}%`;
      
      let finalQuery = query;
      const params = [searchTerm, searchTermLower, searchTermUpper, searchTerm, searchTerm, searchTerm];
      
      // Only apply limit if explicitly requested, default to no limit for comprehensive search
      if (options.limit && options.limit > 0) {
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
        participants: row.participants ? row.participants.split(', ') : []
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
   * Debug company search to see all matching meetings and variations
   */
  async debugCompanySearch(companyName) {
    try {
      // Get all meetings that might match the company name
      const allMeetingsQuery = `
        SELECT DISTINCT 
          m.id,
          m.title,
          m.start_time,
          STRING_AGG(DISTINCT CONCAT(mp.name, ' (', mp.email, ')'), ', ') as participants
        FROM meetings m
        LEFT JOIN meeting_participants mp ON m.id = mp.meeting_id
        GROUP BY m.id, m.title, m.start_time
        ORDER BY m.start_time DESC
        LIMIT 50
      `;

      const allMeetings = await this.db.all(allMeetingsQuery);

      // Filter meetings that might contain the company name (case-insensitive)
      const searchTerm = companyName.toLowerCase();
      const potentialMatches = allMeetings.filter(meeting => {
        const titleMatch = meeting.title?.toLowerCase().includes(searchTerm);
        const participantMatch = meeting.participants?.toLowerCase().includes(searchTerm);
        return titleMatch || participantMatch;
      });

      // Also get exact matches using the current search logic
      const exactMatches = await this.searchByCompany(companyName, { limit: 100 });

      return {
        searchTerm: companyName,
        totalMeetingsInDB: allMeetings.length,
        potentialMatches: potentialMatches.length,
        exactMatches: exactMatches.length,
        allMeetings: allMeetings.slice(0, 10), // First 10 for debugging
        potentialMatchesDetails: potentialMatches,
        exactMatchesDetails: exactMatches
      };
    } catch (error) {
      console.error('Error debugging company search:', error);
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

  /**
   * Get dashboard metrics including sync status
   */
  async getDashboardMetrics() {
    try {
      return await this.db.getDashboardMetrics();
    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      throw error;
    }
  }

  /**
   * Download multiple transcripts as a single chronological journey file
   */
  async downloadMultipleTranscripts(ids) {
    try {
      // Fetch all transcripts
      const transcripts = [];
      for (const id of ids) {
        const transcript = await this.getTranscript(id);
        if (transcript) {
          transcripts.push(transcript);
        }
      }

      if (transcripts.length === 0) {
        throw new Error('No valid transcripts found');
      }

      // Sort by date (oldest first for chronological journey)
      transcripts.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

      // Create filename
      const oldestDate = new Date(transcripts[0].startTime).toISOString().split('T')[0];
      const newestDate = new Date(transcripts[transcripts.length - 1].startTime).toISOString().split('T')[0];
      const filename = `transcript-journey-${oldestDate}-to-${newestDate}.txt`;

      // Build content
      let content = `=== CHRONOLOGICAL TRANSCRIPT JOURNEY ===\n`;
      content += `Start: ${oldestDate} | End: ${newestDate} | Total: ${transcripts.length} transcripts\n\n`;

      for (let i = 0; i < transcripts.length; i++) {
        const transcript = transcripts[i];
        const date = new Date(transcript.startTime).toLocaleDateString();
        const time = new Date(transcript.startTime).toLocaleTimeString();
        
        content += `=== TRANSCRIPT ${i + 1}: ${transcript.title || 'Untitled Meeting'} (${date} ${time}) ===\n`;
        
        // Format the transcript content using the same robust parsing as individual downloads
        let transcriptContent = 'No transcript available';
        if (transcript.transcript) {
          try {
            let transcriptData = transcript.transcript;
            let transcriptProcessed = false;
            
            // If it's a string, try to parse it
            if (typeof transcriptData === 'string') {
              try {
                transcriptData = JSON.parse(transcriptData);
              } catch (parseError) {
                console.log('Failed to parse transcript as JSON, attempting manual extraction...');
                
                // Manual extraction using the same logic as individual downloads
                try {
                  let cleanData = transcriptData.trim();
                  if (cleanData.startsWith('{') && cleanData.endsWith('}')) {
                    cleanData = cleanData.substring(1, cleanData.length - 1);
                  }
                  
                  const rawEntries = cleanData.split(/","/);
                  const entries = [];
                  
                  for (let i = 0; i < rawEntries.length; i++) {
                    try {
                      let entryStr = rawEntries[i];
                      
                      if (entryStr.startsWith('"')) {
                        entryStr = entryStr.substring(1);
                      }
                      if (entryStr.endsWith('"')) {
                        entryStr = entryStr.substring(0, entryStr.length - 1);
                      }
                      
                      const unescapedStr = entryStr
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\')
                        .replace(/\\n/g, '\n')
                        .replace(/\\r/g, '\r')
                        .replace(/\\t/g, '\t');
                      
                      const entry = JSON.parse(unescapedStr);
                      entries.push(entry);
                    } catch (entryError) {
                      continue;
                    }
                  }
                  
                  if (entries.length > 0) {
                    transcriptContent = entries.map(entry => {
                      const speaker = entry.speaker?.display_name || entry.speaker || 'Unknown';
                      const text = entry.text || entry.content || '';
                      const timestamp = entry.timestamp || entry.time || '';
                      return `${speaker} [${timestamp}]: ${text}`;
                    }).join('\n\n');
                    transcriptProcessed = true;
                  }
                } catch (manualError) {
                  console.error('Manual extraction failed:', manualError);
                }
              }
            }
            
            // If manual extraction didn't work, try the original object parsing
            if (!transcriptProcessed && typeof transcriptData === 'object' && transcriptData !== null) {
              const entries = [];
              
              if (Array.isArray(transcriptData)) {
                entries.push(...transcriptData);
              } else if (typeof transcriptData === 'object') {
                const keys = Object.keys(transcriptData).sort((a, b) => parseInt(a) - parseInt(b));
                for (const key of keys) {
                  try {
                    const entry = JSON.parse(transcriptData[key]);
                    entries.push(entry);
                  } catch (parseError) {
                    continue;
                  }
                }
              }
              
              if (entries.length > 0) {
                transcriptContent = entries.map(entry => {
                  const speaker = entry.speaker?.display_name || entry.speaker || 'Unknown';
                  const text = entry.text || entry.content || '';
                  const timestamp = entry.timestamp || entry.time || '';
                  return `${speaker} [${timestamp}]: ${text}`;
                }).join('\n\n');
              }
            }
          } catch (error) {
            console.error('Error processing transcript:', error);
            transcriptContent = 'Error processing transcript content';
          }
        }
        
        content += transcriptContent + '\n\n';
      }

      return {
        filename,
        content
      };
    } catch (error) {
      console.error('Error creating transcript journey:', error);
      throw error;
    }
  }
}

module.exports = TranscriptService;