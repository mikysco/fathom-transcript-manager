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
${transcript.transcript || 'No transcript available'}
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
