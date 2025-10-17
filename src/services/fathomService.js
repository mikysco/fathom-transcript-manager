const axios = require('axios');

class FathomService {
  constructor(apiKey, baseUrl = 'https://api.fathom.ai/external/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Fetch all meetings with transcripts
   */
  async getMeetings(options = {}) {
    try {
      const params = {
        include_transcript: true,
        ...options.filters
      };

      // Add cursor for pagination if provided
      if (options.cursor) {
        params.cursor = options.cursor;
      }

      const response = await this.client.get('/meetings', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching meetings from Fathom:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch meetings filtered by email address
   */
  async getMeetingsByEmail(email, options = {}) {
    try {
      const params = {
        include_transcript: true,
        calendar_invitees: email,
        ...options.filters
      };

      // Add cursor for pagination if provided
      if (options.cursor) {
        params.cursor = options.cursor;
      }

      const response = await this.client.get('/meetings', { params });
      return response.data;
    } catch (error) {
      console.error(`Error fetching meetings for email ${email}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch meetings filtered by domain
   */
  async getMeetingsByDomain(domain, options = {}) {
    try {
      const params = {
        include_transcript: true,
        ...options.filters
      };

      // Add cursor for pagination if provided
      if (options.cursor) {
        params.cursor = options.cursor;
      }

      const response = await this.client.get('/meetings', { params });
      
      // Filter by domain since Fathom doesn't have a direct domain filter
      const filteredMeetings = response.data?.items?.filter(meeting => {
        return meeting.calendar_invitees?.some(invitee => 
          invitee.email?.toLowerCase().endsWith(domain.toLowerCase())
        );
      }) || [];
      
      return {
        items: filteredMeetings,
        total: filteredMeetings.length,
        next_cursor: response.data?.next_cursor
      };
    } catch (error) {
      console.error(`Error fetching meetings for domain ${domain}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch meetings filtered by company name (searches in meeting titles and participants)
   */
  async getMeetingsByCompany(companyName, options = {}) {
    try {
      // First, get all meetings and filter by company name in title or participant info
      const params = {
        include_transcript: true,
        ...options.filters
      };

      // Add cursor for pagination if provided
      if (options.cursor) {
        params.cursor = options.cursor;
      }

      const response = await this.client.get('/meetings', { params });
      
      // Filter meetings that contain the company name in title or participant emails
      const filteredMeetings = response.data?.items?.filter(meeting => {
        const titleMatch = meeting.title?.toLowerCase().includes(companyName.toLowerCase());
        const participantMatch = meeting.calendar_invitees?.some(participant => 
          participant.email?.toLowerCase().includes(companyName.toLowerCase()) ||
          participant.name?.toLowerCase().includes(companyName.toLowerCase())
        );
        return titleMatch || participantMatch;
      }) || [];

      return {
        items: filteredMeetings,
        total: filteredMeetings.length,
        next_cursor: response.data?.next_cursor
      };
    } catch (error) {
      console.error(`Error fetching meetings for company ${companyName}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Process meeting data to extract useful information
   */
  processMeetingData(meeting) {
    const participants = meeting.calendar_invitees || [];
    const domains = [...new Set(participants.map(p => p.email?.split('@')[1]).filter(Boolean))];
    
    // Debug: Log domains for this meeting
    if (domains.length > 0) {
      console.log(`Meeting "${meeting.title || 'Untitled'}": domains found:`, domains);
    }
    
    return {
      fathomId: meeting.id || meeting.url,
      title: meeting.title || meeting.meeting_title,
      startTime: meeting.scheduled_start_time || meeting.recording_start_time,
      endTime: meeting.scheduled_end_time || meeting.recording_end_time,
      duration: meeting.duration,
      recordingUrl: meeting.url,
      transcript: meeting.transcript || '',
      summary: meeting.default_summary?.markdown_formatted || '',
      participants: participants.map(p => ({
        name: p.name,
        email: p.email,
        domain: p.email?.split('@')[1],
        isHost: p.is_external === false || false
      })),
      domains: domains
    };
  }

  /**
   * Sync all meetings to local database
   */
  async syncAllMeetings(db, options = {}) {
    try {
      let allMeetings = [];
      let cursor = null;
      let hasMore = true;
      let requestCount = 0;
      const maxRequestsPerMinute = 60;
      const delayBetweenRequests = 1000; // 1 second between requests to stay under rate limit

      console.log('Starting sync of all meetings from Fathom...');

      while (hasMore) {
        // Check rate limit
        if (requestCount >= maxRequestsPerMinute) {
          console.log('Rate limit reached, waiting 1 minute before continuing...');
          await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
          requestCount = 0;
        }

        const params = {
          include_transcript: true,
          ...options.filters
        };

        // Add cursor for pagination
        if (cursor) {
          params.cursor = cursor;
        }

        console.log(`Fetching meetings (request #${requestCount + 1})...`);
        const response = await this.client.get('/meetings', { params });
        const data = response.data;

        const newMeetings = data.items || [];
        allMeetings = allMeetings.concat(newMeetings);
        
        console.log(`Fetched ${newMeetings.length} meetings (total so far: ${allMeetings.length})`);

        // Check if there are more pages
        hasMore = data.next_cursor && newMeetings.length > 0;
        cursor = data.next_cursor;
        requestCount++;

        // Add delay between requests to respect rate limit
        if (hasMore) {
          console.log(`Waiting ${delayBetweenRequests}ms before next request...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
        }
      }

      console.log(`Sync complete: Total meetings fetched from Fathom: ${allMeetings.length}`);
      return allMeetings;
    } catch (error) {
      console.error('Error syncing meetings:', error);
      throw error;
    }
  }
}

module.exports = FathomService;