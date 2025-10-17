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

    return router;
  }
}

module.exports = SyncRoutes;