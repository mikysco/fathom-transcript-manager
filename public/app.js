// Fathom Transcript Manager - Main Application Logic

// App state
const app = {
    selectedTranscripts: new Set(),
    currentResults: []
};

// DOM Elements
const testApiBtn = document.getElementById('testApiBtn');
const syncDataBtn = document.getElementById('syncDataBtn');
const fullSyncBtn = document.getElementById('fullSyncBtn');
const searchResults = document.getElementById('searchResults');
const emailSearchBtn = document.getElementById('emailSearchBtn');
const domainSearchBtn = document.getElementById('domainSearchBtn');
const companySearchBtn = document.getElementById('companySearchBtn');

// Dashboard Elements
const totalTranscripts = document.getElementById('totalTranscripts');
const totalCompanies = document.getElementById('totalCompanies');
const lastSyncTime = document.getElementById('lastSyncTime');

// Event Listeners
if (testApiBtn) {
    testApiBtn.addEventListener('click', testFathomApi);
}

if (syncDataBtn) {
    syncDataBtn.addEventListener('click', () => syncData('incremental'));
}

if (fullSyncBtn) {
    fullSyncBtn.addEventListener('click', () => syncData('full'));
}

const fixDurationsBtn = document.getElementById('fixDurationsBtn');
if (fixDurationsBtn) {
    fixDurationsBtn.addEventListener('click', async () => {
        try {
            showLoading('Fixing durations...');
            const response = await fetch('/api/sync/fix-durations', { method: 'POST' });
            const result = await response.json();
            
            if (result.success) {
                showAlert(`✅ ${result.message}`, 'success');
                // Refresh the current search results if any
                const currentSearch = document.querySelector('input[type="text"]:focus, input[type="email"]:focus');
                if (currentSearch && currentSearch.value.trim()) {
                    const searchType = currentSearch.id.replace('Input', '').replace('email', 'email').replace('domain', 'domain').replace('company', 'company');
                    await searchTranscripts(searchType);
                }
            } else {
                showAlert(`❌ Fix durations failed: ${result.error}`, 'error');
            }
        } catch (error) {
            showAlert(`❌ Fix durations error: ${error.message}`, 'error');
        }
    });
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

// Download button event listener
document.addEventListener('click', (e) => {
    if (e.target.id === 'downloadBtn' || e.target.closest('#downloadBtn')) {
        handleDownloadClick();
    }
});

// Dashboard Functions
async function loadDashboard() {
    try {
        const response = await fetch('/api/transcripts/dashboard');
        const result = await response.json();
        
        if (response.ok && result.success) {
            updateDashboardMetrics(result.data);
        } else {
            console.error('Failed to load dashboard:', result.error);
            showDashboardError();
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showDashboardError();
    }
}

function updateDashboardMetrics(data) {
    if (totalTranscripts) {
        totalTranscripts.textContent = data.total_transcripts.toLocaleString();
    }
    
    if (totalCompanies) {
        totalCompanies.textContent = data.total_companies.toLocaleString();
    }
    
    if (lastSyncTime) {
        if (data.last_sync_time) {
            const syncDate = new Date(data.last_sync_time);
            const now = new Date();
            const diffMs = now - syncDate;
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffHours / 24);
            
            let timeText;
            if (diffDays > 0) {
                timeText = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
            } else if (diffHours > 0) {
                timeText = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            } else {
                const diffMinutes = Math.floor(diffMs / (1000 * 60));
                timeText = diffMinutes < 1 ? 'Just now' : `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
            }
            
            lastSyncTime.innerHTML = `
                <span class="text-gray-900">${timeText}</span>
                <br>
                <span class="text-xs text-gray-500">${syncDate.toLocaleString()}</span>
            `;
        } else {
            lastSyncTime.textContent = 'Never synced';
        }
    }
}

function showDashboardError() {
    if (totalTranscripts) totalTranscripts.textContent = 'Error';
    if (totalCompanies) totalCompanies.textContent = 'Error';
    if (lastSyncTime) lastSyncTime.textContent = 'Error loading';
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

async function syncData(syncType = 'incremental') {
    try {
        const isIncremental = syncType === 'incremental';
        const loadingMessage = isIncremental ? 'Syncing new data from Fathom...' : 'Performing full sync from Fathom...';
        showLoading(loadingMessage);
        
        const endpoint = isIncremental ? '/api/sync/meetings' : '/api/sync/meetings/full';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            const syncTypeText = isIncremental ? 'Incremental sync' : 'Full sync';
            showSuccess(`✅ ${syncTypeText} complete: ${result.data?.synced || 0} meetings processed`);
            // Refresh dashboard after successful sync
            await loadDashboard();
        } else {
            showError(`❌ Sync failed: ${result.error}`);
        }
    } catch (error) {
        showError(`❌ Network error: ${error.message}`);
    } finally {
        hideLoading();
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
        console.log('Search API response:', result);
        
        if (response.ok && result.success) {
            console.log('First result duration from API:', result.data[0]?.duration, 'type:', typeof result.data[0]?.duration);
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

function hideLoading() {
    // Loading is automatically hidden when results are displayed
    // This function exists for compatibility but doesn't need to do anything
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
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-search text-4xl mb-4"></i>
                <p>No transcripts found for your search. Try syncing data or a different query.</p>
            </div>
        `;
        // Clear selections and hide controls
        app.selectedTranscripts.clear();
        app.currentResults = [];
        updateSelectedCount();
        return;
    }
    
    // Sort results by date (newest first)
    const sortedResults = results.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    // Store current results and clear selections
    app.currentResults = sortedResults;
    app.selectedTranscripts.clear();
    
    // Show selection controls
    const selectAllBtn = document.getElementById('selectAllBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const selectedCountSpan = document.getElementById('selectedCount');
    
    if (selectAllBtn) selectAllBtn.style.display = 'inline-block';
    if (downloadBtn) downloadBtn.style.display = 'inline-block';
    if (selectedCountSpan) selectedCountSpan.textContent = '0';
    
    // Create table HTML
    const tableHtml = `
        <div class="overflow-x-auto">
            <table class="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                            <!-- Checkbox column header (no checkbox) -->
                        </th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Meeting Title</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date/Time</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Participants</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${sortedResults.map(result => `
                        <tr class="hover:bg-gray-50 transition-colors">
                            <td class="px-4 py-3">
                                <input type="checkbox" class="transcript-checkbox form-checkbox h-4 w-4 text-blue-600" value="${result.id}">
                            </td>
                            <td class="px-4 py-3">
                                <div class="text-sm font-medium text-gray-900 max-w-xs truncate" title="${result.title || 'Untitled Meeting'}">
                                    ${result.title || 'Untitled Meeting'}
                                </div>
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-600">
                                ${formatDate(result.startTime)}
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-600">
                                ${result.participants ? result.participants.length : 0}
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-600">
                                ${(() => {
                                    console.log('Table rendering - result.duration:', result.duration, 'type:', typeof result.duration);
                                    return formatDuration(result.duration);
                                })()}
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-600">
                                <div class="flex space-x-2">
                                    <button class="view-transcript-btn text-blue-600 hover:text-blue-800 font-medium" data-id="${result.id}">
                                        View
                                    </button>
                                    <button class="download-transcript-btn text-green-600 hover:text-green-800 font-medium" data-id="${result.id}">
                                        Download
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    searchResults.innerHTML = tableHtml;
    
    // Add event listeners for checkboxes
    setupCheckboxListeners();
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function formatDuration(seconds) {
    console.log('formatDuration called with:', seconds, 'type:', typeof seconds);
    if (!seconds || seconds === null || seconds === undefined) return 'Unknown';
    
    // Handle different possible formats
    let durationInSeconds;
    if (typeof seconds === 'number') {
        durationInSeconds = seconds;
    } else if (typeof seconds === 'string') {
        durationInSeconds = parseInt(seconds);
    } else {
        console.log('Unexpected duration format:', seconds);
        return 'Unknown';
    }
    
    if (isNaN(durationInSeconds) || durationInSeconds <= 0) {
        console.log('Invalid duration value:', seconds);
        return 'Unknown';
    }
    
    const minutes = Math.floor(durationInSeconds / 60);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${minutes}m`;
}

function setupCheckboxListeners() {
    // Individual checkbox listeners
    document.querySelectorAll('.transcript-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                app.selectedTranscripts.add(e.target.value);
            } else {
                app.selectedTranscripts.delete(e.target.value);
            }
            updateSelectedCount();
        });
    });
    
    // Select all button listener
    const selectAllBtn = document.getElementById('selectAllBtn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('.transcript-checkbox');
            const allChecked = app.currentResults.every(result => 
                app.selectedTranscripts.has(result.id.toString())
            );
            
            // Toggle all checkboxes
            checkboxes.forEach(checkbox => {
                checkbox.checked = !allChecked;
                if (!allChecked) {
                    app.selectedTranscripts.add(checkbox.value);
                } else {
                    app.selectedTranscripts.delete(checkbox.value);
                }
            });
            updateSelectedCount();
        });
    }
}

function updateSelectedCount() {
    const selectedCountSpan = document.getElementById('selectedCount');
    const downloadBtn = document.getElementById('downloadBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    
    const count = app.selectedTranscripts.size;
    
    if (selectedCountSpan) {
        selectedCountSpan.textContent = count;
    }
    
    if (downloadBtn) {
        if (count === 0) {
            downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download Selected (0)';
            downloadBtn.disabled = true;
            downloadBtn.classList.add('opacity-50', 'cursor-not-allowed');
        } else if (count === 1) {
            downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download Selected (1)';
            downloadBtn.disabled = false;
            downloadBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            downloadBtn.innerHTML = `<i class="fas fa-download mr-2"></i>Download Journey (${count})`;
            downloadBtn.disabled = false;
            downloadBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
    
    // Update Select All button text
    if (selectAllBtn && app.currentResults.length > 0) {
        const allChecked = app.currentResults.every(result => 
            app.selectedTranscripts.has(result.id.toString())
        );
        if (allChecked) {
            selectAllBtn.innerHTML = '<i class="fas fa-square mr-1"></i>Deselect All';
        } else {
            selectAllBtn.innerHTML = '<i class="fas fa-check-square mr-1"></i>Select All';
        }
    }
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

function handleDownloadClick() {
    const selectedIds = Array.from(app.selectedTranscripts);
    
    if (selectedIds.length === 0) {
        showError('Please select at least one transcript to download');
        return;
    }
    
    if (selectedIds.length === 1) {
        // Single transcript download
        downloadTranscript(selectedIds[0]);
    } else {
        // Multiple transcript download
        downloadMultipleTranscripts(selectedIds);
    }
}

async function downloadMultipleTranscripts(ids) {
    console.log('Downloading multiple transcripts:', ids);
    try {
        showLoading('Preparing transcript journey...');
        
        const response = await fetch('/api/transcripts/download-multiple', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ids: ids })
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Get filename from response headers or create default
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'transcript-journey.txt';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showSuccess(`✅ Downloaded transcript journey with ${ids.length} transcripts`);
        } else {
            const error = await response.json();
            showError(`❌ Download failed: ${error.error || 'Unknown error'}`);
        }
    } catch (error) {
        showError(`❌ Network error: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function downloadTranscript(id) {
    console.log('downloadTranscript called with ID:', id);
    try {
        // Fetch the transcript data from the API
        console.log('Fetching transcript from API...');
        const response = await fetch(`/api/transcripts/${id}`);
        console.log('API response status:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            
            if (result.success && result.data) {
                const transcript = result.data;
                
                // Parse and format the transcript
                let formattedTranscript = 'No transcript available';
                let transcriptProcessed = false; // Flag to track if we successfully processed the transcript
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
                                        // Mark that we successfully processed the transcript
                                        transcriptProcessed = true;
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

                        // Only continue with other processing methods if we haven't already processed the transcript
                        if (!transcriptProcessed) {
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
                        } // End of if (!transcriptProcessed)
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
        console.log('Download button clicked!');
        const id = parseInt(e.target.dataset.id);
        console.log('Transcript ID:', id);
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
    // Load dashboard metrics on page load
    loadDashboard();
});
