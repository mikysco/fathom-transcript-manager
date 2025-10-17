const fetch = require('node-fetch');

async function debugDuration() {
    try {
        // Replace with your actual Railway URL
        const baseUrl = 'https://fathom-transcript-manager-production.up.railway.app';
        
        console.log('🔍 Checking duration data in database...');
        
        const response = await fetch(`${baseUrl}/api/transcripts/debug/duration`);
        const result = await response.json();
        
        if (result.success) {
            console.log('\n📊 Duration Debug Results:');
            console.log('========================');
            
            if (result.data.sample_meeting) {
                const meeting = result.data.sample_meeting;
                console.log('\n📝 Sample Meeting:');
                console.log(`Title: ${meeting.title}`);
                console.log(`Start Time: ${meeting.start_time}`);
                console.log(`End Time: ${meeting.end_time}`);
                console.log(`Stored Duration: ${meeting.duration}`);
                console.log(`Calculated Duration: ${meeting.calculated_duration} seconds`);
                
                if (meeting.calculated_duration) {
                    const minutes = Math.floor(meeting.calculated_duration / 60);
                    const hours = Math.floor(minutes / 60);
                    const mins = minutes % 60;
                    const formatted = hours > 0 ? `${hours}h ${mins}m` : `${minutes}m`;
                    console.log(`Formatted Duration: ${formatted}`);
                }
            }
            
            console.log('\n📋 All Meetings:');
            result.data.meetings.forEach((meeting, index) => {
                console.log(`${index + 1}. ${meeting.title}`);
                console.log(`   Stored: ${meeting.duration}, Calculated: ${meeting.calculated_duration}`);
            });
            
        } else {
            console.error('❌ Debug failed:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

debugDuration();
