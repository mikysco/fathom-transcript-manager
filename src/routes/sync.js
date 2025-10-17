const express = require('express');
const router = express.Router();

class SyncRoutes {
  constructor(transcriptService) {
    this.transcriptService = transcriptService;
  }

  /**
   * Get all routes
   */
  getRoutes() {
    // Sync meetings from Fathom (incremental by default)
    router.post('/meetings', async (req, res) => {
      try {
        const options = { incremental: true, ...req.body };
        
        console.log('Starting incremental meeting sync...');
        const result = await this.transcriptService.syncMeetings(options);
        
        res.json({
          success: true,
          message: 'Meetings synced successfully',
          data: result
        });
      } catch (error) {
        console.error('Error syncing meetings:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to sync meetings',
          message: error.message
        });
      }
    });

    // Full sync meetings from Fathom (all meetings)
    router.post('/meetings/full', async (req, res) => {
      try {
        const options = { incremental: false, ...req.body };
        
        console.log('Starting full meeting sync...');
        const result = await this.transcriptService.syncMeetings(options);
        
        res.json({
          success: true,
          message: 'Full sync completed successfully',
          data: result
        });
      } catch (error) {
        console.error('Error syncing meetings:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to sync meetings',
          message: error.message
        });
      }
    });

    // Get sync status
    router.get('/status', async (req, res) => {
      try {
        const db = this.transcriptService.db;
        
        const [meetingCount, participantCount, domainCount] = await Promise.all([
          db.get('SELECT COUNT(*) as count FROM meetings'),
          db.get('SELECT COUNT(*) as count FROM meeting_participants'),
          db.get('SELECT COUNT(DISTINCT domain) as count FROM meeting_participants WHERE domain IS NOT NULL')
        ]);

        res.json({
          success: true,
          data: {
            meetings: meetingCount.count,
            participants: participantCount.count,
            uniqueDomains: domainCount.count,
            lastSync: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Error getting sync status:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get sync status',
          message: error.message
        });
      }
    });

    // Test Fathom API connectivity
    router.get('/test-fathom', async (req, res) => {
      try {
        console.log('🧪 Testing Fathom API connectivity...');
        
        // Test basic connectivity with a small request
        const meetings = await this.transcriptService.fathomService.getMeetings({ limit: 1 });
        
        res.json({
          success: true,
          message: 'Fathom API connectivity test successful',
          data: {
            meetingsFound: meetings?.meetings?.length || 0,
            apiWorking: true,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Fathom API test failed:', error);
        res.status(500).json({
          success: false,
          error: 'Fathom API connectivity test failed',
          message: error.message,
          data: {
            apiWorking: false,
            timestamp: new Date().toISOString()
          }
        });
      }
    });

    // Test endpoint to check database state
    router.get('/test-db', async (req, res) => {
      try {
        const db = this.transcriptService.db;
        
        // Get a sample of meetings to check their data
        const meetings = await db.all(`
          SELECT id, title, start_time, end_time, duration
          FROM meetings 
          ORDER BY start_time DESC
          LIMIT 5
        `);
        
        res.json({
          success: true,
          data: {
            totalMeetings: meetings.length,
            meetings: meetings
          }
        });
      } catch (error) {
        console.error('Error testing database:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to test database',
          message: error.message
        });
      }
    });

    // Fix durations for existing meetings
    router.post('/fix-durations', async (req, res) => {
      try {
        const db = this.transcriptService.db;
        
        console.log('🔧 Starting duration fix for existing meetings...');
        
        // Get meetings with null duration OR scheduled durations that need fixing
        const meetings = await db.all(`
          SELECT id, title, start_time, end_time, duration, transcript
          FROM meetings 
          WHERE (
            duration IS NULL 
            OR duration IN (900, 1800, 2700, 3600)  -- Common scheduled durations: 15min, 30min, 45min, 60min
          )
          AND transcript IS NOT NULL
          ORDER BY start_time DESC
        `);
        
        console.log(`📊 Found ${meetings.length} meetings with null or scheduled durations`);
        
        // Debug: Show sample meeting data
        if (meetings.length > 0) {
          const sample = meetings[0];
          console.log(`🔍 Sample meeting: "${sample.title}"`);
          console.log(`   Start: ${sample.start_time}`);
          console.log(`   End: ${sample.end_time}`);
          console.log(`   Duration: ${sample.duration}`);
          
          // Debug transcript extraction
          if (sample.transcript) {
            const transcriptDuration = this.extractDurationFromTranscript(sample.transcript);
            console.log(`   Transcript duration extracted: ${transcriptDuration} seconds`);
            console.log(`   Transcript preview: ${sample.transcript.substring(0, 200)}...`);
          }
        }
        
        if (meetings.length === 0) {
          return res.json({
            success: true,
            message: 'No meetings need duration fixes',
            data: { updated: 0 }
          });
        }
        
        // Calculate and update durations
        let updated = 0;
        for (const meeting of meetings) {
          try {
            let durationSeconds = 0;
            let method = '';
            
            // Method 1: Extract from transcript timestamps (PRIORITY - actual duration)
            if (meeting.transcript) {
              const transcriptDuration = this.extractDurationFromTranscript(meeting.transcript);
              if (transcriptDuration > 0) {
                durationSeconds = transcriptDuration;
                method = 'transcript timestamps (actual)';
              }
            }
            
            // Method 2: Calculate from start/end times (fallback - scheduled duration)
            if (durationSeconds <= 0 && meeting.start_time && meeting.end_time) {
              const start = new Date(meeting.start_time);
              const end = new Date(meeting.end_time);
              durationSeconds = Math.floor((end - start) / 1000);
              method = 'start/end times (scheduled)';
            }
            
            if (durationSeconds > 0) {
              await db.query(
                'UPDATE meetings SET duration = $1 WHERE id = $2',
                [durationSeconds, meeting.id]
              );
              updated++;
              
              const minutes = Math.floor(durationSeconds / 60);
              const hours = Math.floor(minutes / 60);
              const mins = minutes % 60;
              const formatted = hours > 0 ? `${hours}h ${mins}m` : `${minutes}m`;
              
              console.log(`✅ Updated "${meeting.title}": ${formatted} (from ${method})`);
            } else {
              console.log(`⚠️ Could not calculate duration for "${meeting.title}"`);
            }
          } catch (error) {
            console.error(`❌ Error processing meeting "${meeting.title}":`, error);
          }
        }
        
        console.log(`🎉 Updated ${updated} meetings with calculated durations`);
        
        res.json({
          success: true,
          message: `Successfully updated ${updated} meetings with calculated durations`,
          data: { updated }
        });
        
      } catch (error) {
        console.error('Error fixing durations:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fix durations',
          message: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    });

    return router;
  }
  
  /**
   * Extract duration from transcript timestamps
   * Looks for the latest timestamp in the transcript and converts to seconds
   */
  extractDurationFromTranscript(transcript) {
    try {
      let transcriptData = transcript;
      
      // If it's a string, try to parse it
      if (typeof transcriptData === 'string') {
        try {
          transcriptData = JSON.parse(transcriptData);
        } catch (parseError) {
          // If JSON parsing fails, try manual extraction
          return this.extractDurationFromTranscriptString(transcriptData);
        }
      }
      
      if (typeof transcriptData === 'object' && transcriptData !== null) {
        const entries = [];
        
        if (Array.isArray(transcriptData)) {
          entries.push(...transcriptData);
        } else {
          // Handle object with numeric keys
          const keys = Object.keys(transcriptData).sort((a, b) => parseInt(a) - parseInt(b));
          for (const key of keys) {
            try {
              const entry = typeof transcriptData[key] === 'string' 
                ? JSON.parse(transcriptData[key]) 
                : transcriptData[key];
              entries.push(entry);
            } catch (parseError) {
              continue;
            }
          }
        }
        
        // Find the latest timestamp
        let latestTimestamp = 0;
        for (const entry of entries) {
          const timestamp = this.parseTimestamp(entry.timestamp || entry.time || '');
          if (timestamp > latestTimestamp) {
            latestTimestamp = timestamp;
          }
        }
        
        return latestTimestamp;
      }
      
      return 0;
    } catch (error) {
      console.error('Error extracting duration from transcript:', error);
      return 0;
    }
  }
  
  /**
   * Extract duration from malformed transcript string
   */
  extractDurationFromTranscriptString(transcriptString) {
    try {
      // Look for timestamp patterns like "00:05:30" or "5:30" or "330" (seconds)
      const timestampRegex = /"timestamp":\s*"([^"]+)"/g;
      const timeRegex = /"time":\s*"([^"]+)"/g;
      
      // Also look for bracket format timestamps like [00:17:05] in the raw text
      const bracketTimestampRegex = /\[(\d{1,2}:\d{2}:\d{2})\]/g;
      
      let latestSeconds = 0;
      let match;
      
      // Try timestamp field
      while ((match = timestampRegex.exec(transcriptString)) !== null) {
        const seconds = this.parseTimestamp(match[1]);
        if (seconds > latestSeconds) {
          latestSeconds = seconds;
        }
      }
      
      // Try time field if timestamp didn't work
      if (latestSeconds === 0) {
        while ((match = timeRegex.exec(transcriptString)) !== null) {
          const seconds = this.parseTimestamp(match[1]);
          if (seconds > latestSeconds) {
            latestSeconds = seconds;
          }
        }
      }
      
      // Try bracket format timestamps if other methods didn't work
      if (latestSeconds === 0) {
        while ((match = bracketTimestampRegex.exec(transcriptString)) !== null) {
          const seconds = this.parseTimestamp(match[1]);
          if (seconds > latestSeconds) {
            latestSeconds = seconds;
          }
        }
      }
      
      return latestSeconds;
    } catch (error) {
      console.error('Error extracting duration from transcript string:', error);
      return 0;
    }
  }
  
  /**
   * Parse various timestamp formats to seconds
   */
  parseTimestamp(timestamp) {
    if (!timestamp) return 0;
    
    // Handle different timestamp formats
    const str = timestamp.toString().trim();
    
    // Format: "00:05:30" or "[00:05:30]" (HH:MM:SS with optional brackets)
    if (str.includes(':') && str.split(':').length === 3) {
      // Remove brackets if present
      const cleanStr = str.replace(/[\[\]]/g, '');
      const parts = cleanStr.split(':').map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }
    
    // Format: "5:30" or "[5:30]" (MM:SS with optional brackets)
    if (str.includes(':') && str.split(':').length === 2) {
      // Remove brackets if present
      const cleanStr = str.replace(/[\[\]]/g, '');
      const parts = cleanStr.split(':').map(Number);
      if (parts.length === 2 && !parts.some(isNaN)) {
        return parts[0] * 60 + parts[1];
      }
    }
    
    // Format: "330" (seconds as number)
    const numericValue = parseFloat(str);
    if (!isNaN(numericValue) && numericValue > 0) {
      // If it's a reasonable duration (less than 8 hours), assume it's seconds
      if (numericValue < 28800) {
        return Math.floor(numericValue);
      }
      // If it's larger, it might be milliseconds
      if (numericValue > 1000) {
        return Math.floor(numericValue / 1000);
      }
    }
    
    return 0;
  }
}

module.exports = SyncRoutes;