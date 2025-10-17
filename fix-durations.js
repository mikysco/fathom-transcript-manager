require('dotenv').config();
const PostgreSQLDatabase = require('./src/models/postgres');

async function fixDurations() {
    const db = new PostgreSQLDatabase();
    
    try {
        await db.connect();
        console.log('🔗 Connected to database');
        
        // Get all meetings with null duration but valid start/end times
        const meetings = await db.all(`
            SELECT id, title, start_time, end_time, duration
            FROM meetings 
            WHERE duration IS NULL 
            AND start_time IS NOT NULL 
            AND end_time IS NOT NULL
            ORDER BY start_time DESC
            LIMIT 20
        `);
        
        console.log(`📊 Found ${meetings.length} meetings with null duration`);
        
        if (meetings.length === 0) {
            console.log('✅ No meetings need duration fixes');
            return;
        }
        
        // Show sample meeting
        const sample = meetings[0];
        console.log('\n📝 Sample meeting:');
        console.log(`Title: ${sample.title}`);
        console.log(`Start: ${sample.start_time}`);
        console.log(`End: ${sample.end_time}`);
        
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
        
        console.log(`\n🎉 Updated ${updated} meetings with calculated durations`);
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await db.close();
    }
}

fixDurations();
