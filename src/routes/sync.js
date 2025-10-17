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

    // Fix durations for existing meetings
    router.post('/fix-durations', async (req, res) => {
      try {
        const db = this.transcriptService.db;
        
        console.log('🔧 Starting duration fix for existing meetings...');
        
        // Get meetings with null duration but valid start/end times
        const meetings = await db.all(`
          SELECT id, title, start_time, end_time, duration
          FROM meetings 
          WHERE duration IS NULL 
          AND start_time IS NOT NULL 
          AND end_time IS NOT NULL
          ORDER BY start_time DESC
        `);
        
        console.log(`📊 Found ${meetings.length} meetings with null duration`);
        
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
          const start = new Date(meeting.start_time);
          const end = new Date(meeting.end_time);
          const durationSeconds = Math.floor((end - start) / 1000);
          
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
            
            console.log(`✅ Updated "${meeting.title}": ${formatted}`);
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
          message: error.message
        });
      }
    });

    return router;
  }
}

module.exports = SyncRoutes;