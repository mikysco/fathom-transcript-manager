const express = require('express');
const router = express.Router();

class TranscriptRoutes {
  constructor(transcriptService) {
    this.transcriptService = transcriptService;
  }

  /**
   * Get all routes
   */
  getRoutes() {
    // Search by email address
    router.get('/search/email', async (req, res) => {
      try {
        const { q: email } = req.query;
        const { limit } = req.query;
        
        const results = await this.transcriptService.searchByEmail(email, { limit });
        
        res.json({
          success: true,
          data: results,
          count: results.length
        });
      } catch (error) {
        console.error('Error searching by email:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to search by email',
          message: error.message
        });
      }
    });

    // Search by domain
    router.get('/search/domain', async (req, res) => {
      try {
        const { q: domain } = req.query;
        const { limit } = req.query;
        
        const results = await this.transcriptService.searchByDomain(domain, { limit });
        
        res.json({
          success: true,
          data: results,
          count: results.length
        });
      } catch (error) {
        console.error('Error searching by domain:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to search by domain',
          message: error.message
        });
      }
    });

    // Search by company name
    router.get('/search/company', async (req, res) => {
      try {
        const { q: company } = req.query;
        const { limit } = req.query;
        
        const results = await this.transcriptService.searchByCompany(company, { limit });
        
        res.json({
          success: true,
          data: results,
          count: results.length
        });
      } catch (error) {
        console.error('Error searching by company:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to search by company',
          message: error.message
        });
      }
    });

    // Get all domains
    router.get('/domains', async (req, res) => {
      try {
        const domains = await this.transcriptService.getDomains();
        
        res.json({
          success: true,
          data: domains
        });
      } catch (error) {
        console.error('Error fetching domains:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch domains',
          message: error.message
        });
      }
    });

    // Get specific transcript
    router.get('/:id', async (req, res) => {
      try {
        const { id } = req.params;
        
        const transcript = await this.transcriptService.getTranscript(id);
        
        if (!transcript) {
          return res.status(404).json({
            success: false,
            error: 'Transcript not found'
          });
        }
        
        res.json({
          success: true,
          data: transcript
        });
      } catch (error) {
        console.error('Error fetching transcript:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch transcript',
          message: error.message
        });
      }
    });

    // Concatenate selected transcripts
    router.post('/concatenate', async (req, res) => {
      try {
        const { transcriptIds } = req.body;
        
        if (!transcriptIds || !Array.isArray(transcriptIds) || transcriptIds.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'transcriptIds array is required'
          });
        }
        
        const concatenatedText = await this.transcriptService.concatenateTranscripts(transcriptIds);
        
        res.json({
          success: true,
          data: {
            text: concatenatedText,
            count: transcriptIds.length
          }
        });
      } catch (error) {
        console.error('Error concatenating transcripts:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to concatenate transcripts',
          message: error.message
        });
      }
    });

    return router;
  }
}

module.exports = TranscriptRoutes;