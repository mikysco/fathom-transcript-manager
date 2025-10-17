// Fathom Transcript Manager - Main Application Logic

// DOM Elements
const testApiBtn = document.getElementById('testApiBtn');
const syncDataBtn = document.getElementById('syncDataBtn');
const searchResults = document.getElementById('searchResults');
const emailSearchBtn = document.getElementById('emailSearchBtn');
const domainSearchBtn = document.getElementById('domainSearchBtn');
const companySearchBtn = document.getElementById('companySearchBtn');

// Event Listeners
if (testApiBtn) {
    testApiBtn.addEventListener('click', testFathomApi);
}

if (syncDataBtn) {
    syncDataBtn.addEventListener('click', syncData);
}

if (emailSearchBtn) {
    emailSearchBtn.addEventListener('click', () => searchTranscripts('email'));
}

if (domainSearchBtn) {
    domainSearchBtn.addEventListener('click', () => searchTranscripts('domain'));
}

if (companySearchBtn) {
    companySearchBtn.addEventListener('click', () => searchTranscripts('company'));
}

// API Functions
async function testFathomApi() {
    try {
        showLoading('Testing Fathom API connectivity...');
        
        const response = await fetch('/api/sync/test-fathom');
        const result = await response.json();
        
        if (response.ok) {
            showSuccess(`✅ Fathom API test successful: ${result.message}`);
        } else {
            showError(`❌ Fathom API test failed: ${result.error}`);
        }
    } catch (error) {
        showError(`❌ Network error: ${error.message}`);
    }
}

async function syncData() {
    try {
        showLoading('Syncing data from Fathom...');
        
        const response = await fetch('/api/sync/meetings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess(`✅ Sync complete: ${result.synced} meetings processed`);
        } else {
            showError(`❌ Sync failed: ${result.error}`);
        }
    } catch (error) {
        showError(`❌ Network error: ${error.message}`);
    }
}

async function searchTranscripts(type) {
    const inputMap = {
        email: { input: document.getElementById('emailInput'), placeholder: 'Email address' },
        domain: { input: document.getElementById('domainInput'), placeholder: 'Domain' },
        company: { input: document.getElementById('companyInput'), placeholder: 'Company name' }
    };
    
    const { input, placeholder } = inputMap[type];
    const query = input.value.trim();
    
    if (!query) {
        showError(`Please enter a ${placeholder.toLowerCase()}`);
        return;
    }
    
    try {
        showLoading(`Searching transcripts by ${type}...`);
        
        const endpoint = `/api/transcripts/search/${type}`;
        const response = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`);
        const result = await response.json();
        
        if (response.ok && result.success) {
            displayResults(result.data);
        } else {
            showError(`❌ Search failed: ${result.error || result.message}`);
        }
    } catch (error) {
        showError(`❌ Network error: ${error.message}`);
    }
}

// UI Helper Functions
function showLoading(message) {
    searchResults.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>${message}</p>
        </div>
    `;
}

function showSuccess(message) {
    searchResults.innerHTML = `
        <div class="success">
            <p>${message}</p>
        </div>
    `;
}

function showError(message) {
    searchResults.innerHTML = `
        <div class="error">
            <p>${message}</p>
        </div>
    `;
}

function displayResults(results) {
    if (!results || results.length === 0) {
        searchResults.innerHTML = `
            <div class="no-results">
                <p>No transcripts found for your search.</p>
            </div>
        `;
        return;
    }
    
    const resultsHtml = results.map(result => `
        <div class="transcript-card">
            <h3>${result.title || 'Untitled Meeting'}</h3>
            <div class="transcript-meta">
                <span class="date">${formatDate(result.startTime)}</span>
                <span class="duration">${formatDuration(result.duration)}</span>
                <span class="participants">${result.participants ? result.participants.length : 0} participants</span>
            </div>
            <div class="transcript-summary">
                ${result.summary || 'No summary available'}
            </div>
            <div class="transcript-actions">
                <button class="btn btn-secondary view-transcript-btn" data-id="${result.id}">View Full Transcript</button>
                <button class="btn btn-primary download-transcript-btn" data-id="${result.id}">Download</button>
            </div>
        </div>
    `).join('');
    
    searchResults.innerHTML = resultsHtml;
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function formatDuration(minutes) {
    if (!minutes) return 'Unknown duration';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

async function viewTranscript(id) {
    try {
        const response = await fetch(`/api/transcripts/${id}`);
        const transcript = await response.json();
        
        if (response.ok) {
            // Create modal or redirect to transcript view
            showTranscriptModal(transcript);
        } else {
            showError(`❌ Failed to load transcript: ${transcript.error}`);
        }
    } catch (error) {
        showError(`❌ Network error: ${error.message}`);
    }
}

async function downloadTranscript(id) {
    try {
        // Fetch the transcript data from the API
        const response = await fetch(`/api/transcripts/${id}`);
        
        if (response.ok) {
            const result = await response.json();
            
            if (result.success && result.data) {
                const transcript = result.data;
                
                // Parse and format the transcript
                let formattedTranscript = 'No transcript available';
                if (transcript.transcript) {
                    try {
                        let transcriptData = transcript.transcript;
                        
                        // If it's a string, try to parse it
                        if (typeof transcriptData === 'string') {
                            console.log('Transcript data is a string, attempting to parse...');
                            console.log('Data length:', transcriptData.length);
                            console.log('First 500 chars:', transcriptData.substring(0, 500));
                            
                            try {
                                transcriptData = JSON.parse(transcriptData);
                                console.log('Successfully parsed transcript JSON');
                            } catch (parseError) {
                                console.error('Failed to parse transcript as JSON:', parseError);
                                console.log('Error at position:', parseError.message);
                                
                                // Try to manually extract entries using regex since JSON is corrupted
                                try {
                                    console.log('Attempting manual extraction using regex...');
                                    console.log('Full transcript data (first 1000 chars):', transcriptData.substring(0, 1000));
                                    
                                    // The data structure appears to be an array of JSON strings
                                    // Let's try splitting by the pattern: },"{
                                    const entries = [];
                                    
                                    // First, remove the outer braces and try to split entries
                                    let cleanData = transcriptData.trim();
                                    if (cleanData.startsWith('{') && cleanData.endsWith('}')) {
                                        cleanData = cleanData.substring(1, cleanData.length - 1);
                                        console.log('Removed outer braces. New first 500 chars:', cleanData.substring(0, 500));
                                    }
                                    
                                    // Try to split by the comma-quote pattern that separates entries
                                    const rawEntries = cleanData.split(/","/);
                                    console.log(`Found ${rawEntries.length} potential entries using split`);
                                    
                                    // Process each raw entry
                                    for (let i = 0; i < rawEntries.length; i++) {
                                        try {
                                            let entryStr = rawEntries[i];
                                            
                                            // Clean up the entry string
                                            // Remove leading quote if present
                                            if (entryStr.startsWith('"')) {
                                                entryStr = entryStr.substring(1);
                                            }
                                            // Remove trailing quote if present
                                            if (entryStr.endsWith('"')) {
                                                entryStr = entryStr.substring(0, entryStr.length - 1);
                                            }
                                            
                                            console.log(`Processing entry ${i}, length: ${entryStr.length}`);
                                            console.log(`Entry preview: ${entryStr.substring(0, 150)}...`);
                                            
                                            // Unescape the JSON string
                                            const unescapedStr = entryStr
                                                .replace(/\\"/g, '"')
                                                .replace(/\\\\/g, '\\')
                                                .replace(/\\n/g, '\n')
                                                .replace(/\\r/g, '\r')
                                                .replace(/\\t/g, '\t');
                                            
                                            console.log(`Unescaped preview: ${unescapedStr.substring(0, 150)}...`);
                                            
                                            const entry = JSON.parse(unescapedStr);
                                            entries.push({ key: i, entry });
                                            
                                            console.log(`✓ Successfully parsed entry ${i}:`, entry.speaker?.display_name, entry.text?.substring(0, 50));
                                        } catch (e) {
                                            console.warn(`✗ Failed to parse entry ${i}:`, e.message);
                                            console.log(`Problematic entry (first 300 chars):`, rawEntries[i].substring(0, 300));
                                        }
                                    }
                                    
                                    // Sort by key and format
                                    entries.sort((a, b) => a.key - b.key);
                                    
                                    if (entries.length > 0) {
                                        formattedTranscript = entries.map(item => {
                                            const entry = item.entry;
                                            const speaker = entry.speaker?.display_name || 'Unknown Speaker';
                                            const text = entry.text || '';
                                            const timestamp = entry.timestamp || '';
                                            return `${speaker} [${timestamp}]: ${text}`;
                                        }).join('\n\n');
                                        
                                        console.log(`Successfully extracted ${entries.length} entries`);
                                        console.log('First 200 chars of formatted:', formattedTranscript.substring(0, 200));
                                    } else {
                                        console.log('No entries could be extracted');
                                        formattedTranscript = 'Error: Unable to extract transcript entries from corrupted data.';
                                    }
                                } catch (extractError) {
                                    console.error('Failed to extract entries:', extractError);
                                    formattedTranscript = 'Error: Unable to parse transcript data. The JSON format appears to be corrupted.';
                                }
                            }
                        }

                        console.log('Transcript data type:', typeof transcriptData);
                        console.log('Is array:', Array.isArray(transcriptData));
                        console.log('Keys:', Object.keys(transcriptData || {}));

                        // Now transcriptData should be an object or array
                        // The format from Fathom is an object where keys are array indices
                        // and values are JSON strings of individual transcript entries
                        
                        if (typeof transcriptData === 'object' && !Array.isArray(transcriptData)) {
                            const entries = [];
                            
                            // Get all keys and sort them numerically (they're array indices as strings)
                            const keys = Object.keys(transcriptData).sort((a, b) => {
                                const numA = parseInt(a);
                                const numB = parseInt(b);
                                return numA - numB;
                            });
                            
                            // Extract all values from the object
                            for (const key of keys) {
                                try {
                                    let entry;
                                    
                                    // Check if the value is already an object or needs parsing
                                    if (typeof transcriptData[key] === 'string') {
                                        // Try to parse as JSON first
                                        try {
                                            entry = JSON.parse(transcriptData[key]);
                                        } catch (e) {
                                            // If JSON parsing fails, try to extract basic info using regex
                                            const textMatch = transcriptData[key].match(/"text":"([^"]*?)"/);
                                            const speakerMatch = transcriptData[key].match(/"display_name":"([^"]*?)"/);
                                            const timestampMatch = transcriptData[key].match(/"timestamp":"([^"]*?)"/);
                                            
                                            if (textMatch || speakerMatch || timestampMatch) {
                                                entry = {
                                                    speaker: { display_name: speakerMatch ? speakerMatch[1] : 'Unknown Speaker' },
                                                    text: textMatch ? textMatch[1] : '',
                                                    timestamp: timestampMatch ? timestampMatch[1] : ''
                                                };
                                            } else {
                                                // If we can't extract anything useful, skip this entry
                                                console.warn(`Skipping malformed entry at key ${key}`);
                                                continue;
                                            }
                                        }
                                    } else if (typeof transcriptData[key] === 'object') {
                                        // Already an object, use directly
                                        entry = transcriptData[key];
                                    } else {
                                        continue;
                                    }
                                    
                                    entries.push(entry);
                                } catch (parseError) {
                                    console.error('Error parsing individual entry:', parseError);
                                }
                            }
                            
                            // Format as readable conversation
                            if (entries.length > 0) {
                                formattedTranscript = entries.map(entry => {
                                    const speaker = entry.speaker?.display_name || 'Unknown Speaker';
                                    const text = entry.text || '';
                                    const timestamp = entry.timestamp || '';
                                    return `${speaker} [${timestamp}]: ${text}`;
                                }).join('\n\n');
                            } else {
                                formattedTranscript = 'No valid transcript entries found';
                            }
                        } else if (Array.isArray(transcriptData)) {
                            // Handle array of transcript entries
                            formattedTranscript = transcriptData.map(entry => {
                                const speaker = entry.speaker?.display_name || 'Unknown Speaker';
                                const text = entry.text || '';
                                const timestamp = entry.timestamp || '';
                                return `${speaker} [${timestamp}]: ${text}`;
                            }).join('\n\n');
                        } else {
                            // Fallback - if it's not an object or array, it might be a string
                            formattedTranscript = transcriptData;
                        }
                    } catch (error) {
                        console.error('Error parsing transcript:', error);
                        console.error('Transcript data:', transcript.transcript);
                        formattedTranscript = 'Error formatting transcript. Please check the console for details.';
                    }
                }

                // Format the transcript data as text
                const content = `
FATHOM TRANSCRIPT
================

Title: ${transcript.title || 'Untitled Meeting'}
Date: ${transcript.startTime ? new Date(transcript.startTime).toLocaleString() : 'Unknown'}
Duration: ${transcript.duration ? Math.round(transcript.duration / 60) + ' minutes' : 'Unknown'}
Participants: ${transcript.participants ? transcript.participants.join(', ') : 'None'}

${transcript.recordingUrl ? 'Recording URL: ' + transcript.recordingUrl + '\n' : ''}
SUMMARY
-------
${transcript.summary || 'No summary available'}

TRANSCRIPT
----------
${formattedTranscript}
`.trim();
                
                // Create and download the file
                const blob = new Blob([content], { type: 'text/plain' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `transcript-${transcript.title?.replace(/[^a-z0-9]/gi, '_') || id}-${new Date().toISOString().split('T')[0]}.txt`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                showSuccess('✅ Transcript downloaded successfully!');
            } else {
                showError(`❌ Download failed: ${result.message || 'Unknown error'}`);
            }
        } else {
            const error = await response.json();
            showError(`❌ Download failed: ${error.error || error.message}`);
        }
    } catch (error) {
        showError(`❌ Network error: ${error.message}`);
    }
}

function showTranscriptModal(transcript) {
    const modal = document.createElement('div');
    modal.className = 'transcript-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>${transcript.title || 'Untitled Meeting'}</h2>
                <button class="close-btn" id="closeModalBtn">&times;</button>
            </div>
            <div class="modal-body">
                <div class="transcript-text">${transcript.transcript || 'No transcript available'}</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function closeModal() {
    const modal = document.querySelector('.transcript-modal');
    if (modal) {
        modal.remove();
    }
}

// Event delegation for dynamically created buttons
document.addEventListener('click', (e) => {
    // Close modal when clicking outside
    if (e.target.classList.contains('transcript-modal')) {
        closeModal();
    }
    
    // Handle view transcript button
    if (e.target.classList.contains('view-transcript-btn')) {
        const id = parseInt(e.target.dataset.id);
        viewTranscript(id);
    }
    
    // Handle download transcript button
    if (e.target.classList.contains('download-transcript-btn')) {
        const id = parseInt(e.target.dataset.id);
        downloadTranscript(id);
    }
    
    // Handle close modal button
    if (e.target.id === 'closeModalBtn') {
        closeModal();
    }
});

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('Fathom Transcript Manager initialized');
});
