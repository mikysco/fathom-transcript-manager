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
        limit: options.limit || 10,
        ...options.filters
      };

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
        limit: options.limit || 10,
        ...options.filters
      };

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
        limit: options.limit || 10,
        ...options.filters
      };

      const response = await this.client.get('/meetings', { params });
      
      // Filter by domain since Fathom doesn't have a direct domain filter
      const filteredMeetings = response.data?.items?.filter(meeting => {
        return meeting.calendar_invitees?.some(invitee => 
          invitee.email?.toLowerCase().endsWith(domain.toLowerCase())
        );
      }) || [];
      
      return {
        items: filteredMeetings,
        total: filteredMeetings.length
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
        limit: options.limit || 10,
        ...options.filters
      };

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
        total: filteredMeetings.length
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
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await this.getMeetings({ 
          limit, 
          offset, 
          ...options 
        });
        
        allMeetings = allMeetings.concat(response.items || []);
        
        hasMore = (response.items?.length || 0) === limit;
        offset += limit;
      }
      
      return allMeetings;
    } catch (error) {
      console.error('Error syncing meetings:', error);
      throw error;
    }
  }
}

module.exports = FathomService;