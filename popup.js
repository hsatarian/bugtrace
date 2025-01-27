// Global variables
let isRecording = false;
let currentSessionId = null;
let updateInterval = null;

// Utility Functions
function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  }).format(date);
}

function getDomainFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return url;
  }
}

function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  
  statusDiv.className = 'mb-4 px-4 py-2 rounded-lg text-sm font-medium fade-in';
  
  switch (type) {
    case 'success':
      statusDiv.classList.add('bg-green-100', 'text-green-800');
      break;
    case 'error':
      statusDiv.classList.add('bg-red-100', 'text-red-800');
      break;
    default:
      statusDiv.classList.add('bg-blue-100', 'text-blue-800');
  }
  
  setTimeout(() => {
    statusDiv.textContent = '';
    statusDiv.className = 'mb-4 px-4 py-2 rounded-lg text-sm font-medium';
  }, 3000);
}

// UI Update Functions
function updateUI() {
  const recordButton = document.getElementById('recordButton');
  const buttonText = recordButton.querySelector('.button-text');
  const icon = recordButton.querySelector('.fas');
  
  if (isRecording) {
    recordButton.classList.remove('bg-blue-600', 'hover:bg-blue-700');
    recordButton.classList.add('bg-red-600', 'hover:bg-red-700');
    buttonText.textContent = 'Stop Recording';
    icon.classList.add('text-white');
  } else {
    recordButton.classList.remove('bg-red-600', 'hover:bg-red-700');
    recordButton.classList.add('bg-blue-600', 'hover:bg-blue-700');
    buttonText.textContent = 'Start Recording';
    icon.classList.add('text-white');
  }
}

function updateSessionsList() {
  const sessionsList = document.getElementById('sessionsList');
  const deleteAllButton = document.getElementById('deleteAllButton');
  
  chrome.storage.local.get(['sessions', 'networkData'], function(result) {
    const sessions = result.sessions || [];
    const networkData = result.networkData || {};
    
    if (sessions.length === 0) {
      sessionsList.innerHTML = `
        <div class="p-8 text-center">
          <div class="text-gray-400 mb-2">
            <i class="fas fa-inbox text-4xl"></i>
          </div>
          <p class="text-gray-500">No recorded sessions yet</p>
        </div>
      `;
      if (deleteAllButton) {
        deleteAllButton.classList.add('opacity-50', 'cursor-not-allowed');
        deleteAllButton.disabled = true;
      }
      return;
    }
    
    if (deleteAllButton) {
      deleteAllButton.classList.remove('opacity-50', 'cursor-not-allowed');
      deleteAllButton.disabled = false;
    }

    // Sort sessions by start time, newest first
    const sortedSessions = [...sessions].sort((a, b) => 
      new Date(b.startTime) - new Date(a.startTime)
    );
    
    sessionsList.innerHTML = sortedSessions.map(session => {
      const requests = networkData[session.id] || [];
      const domains = new Set(requests.map(r => getDomainFromUrl(r.url)));
      const domainList = Array.from(domains);
      
      return `
        <div class="session-item p-4 hover:bg-gray-50 transition-colors duration-200" data-id="${session.id}">
          <div class="flex justify-between items-start">
            <div class="flex-1 min-w-0 cursor-pointer" data-action="export">
              <div class="flex items-center space-x-2">
                <span class="text-sm font-medium text-gray-900">
                  ${formatDateTime(session.startTime)}
                </span>
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  ${requests.length} requests
                </span>
              </div>
              <p class="mt-1 text-sm text-gray-500 truncate">
                ${domainList.length > 0 ? domainList.slice(0, 3).join(', ') + (domainList.length > 3 ? '...' : '') : 'No domains'}
              </p>
            </div>
            <div class="ml-4 flex-shrink-0 flex space-x-3">
              <button class="p-2 text-gray-400 hover:text-gray-500 focus:outline-none text-base" data-action="export" title="Export Session">
                <i class="fas fa-download"></i>
              </button>
              <button class="p-2 text-gray-400 hover:text-red-500 focus:outline-none text-base" data-action="delete" title="Delete Session">
                <i class="fas fa-trash-alt"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  });
}

// Update Interval Functions
function startUpdating() {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  updateInterval = setInterval(updateSessionsList, 1000);
}

function stopUpdating() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

// Session Management Functions
function exportSession(sessionId) {
  console.log('Exporting session:', sessionId);
  
  chrome.runtime.sendMessage({
    action: 'exportData',
    sessionId: sessionId
  }, function(response) {
    console.log('Export response:', response);
    if (response && response.success) {
      showStatus('Export successful', 'success');
    } else {
      const errorMessage = response && response.error ? response.error : 'Unknown error';
      console.error('Export failed:', errorMessage);
      showStatus(`Export failed: ${errorMessage}`, 'error');
    }
  });
}

function deleteSession(sessionId) {
  console.log('Deleting session:', sessionId);
  
  chrome.runtime.sendMessage({
    action: 'deleteSession',
    sessionId: sessionId
  }, function(response) {
    if (chrome.runtime.lastError) {
      console.error('Delete failed:', chrome.runtime.lastError);
      showStatus('Delete failed', 'error');
      return;
    }
    
    updateSessionsList();
    showStatus('Session deleted', 'success');
  });
}

function deleteAllSessions() {
  console.log('Deleting all sessions');
  
  chrome.runtime.sendMessage({
    action: 'deleteAllSessions'
  }, function(response) {
    if (chrome.runtime.lastError) {
      console.error('Delete all failed:', chrome.runtime.lastError);
      showStatus('Failed to delete all sessions', 'error');
      return;
    }
    
    updateSessionsList();
    showStatus('All sessions deleted', 'success');
  });
}

// Initialize Extension
document.addEventListener('DOMContentLoaded', function() {
  const recordButton = document.getElementById('recordButton');
  const sessionsList = document.getElementById('sessionsList');
  const deleteAllButton = document.getElementById('deleteAllButton');

  console.log('Popup initialized');

  // Add event delegation for session actions
  sessionsList.addEventListener('click', function(e) {
    const actionElement = e.target.closest('[data-action]');
    if (!actionElement) return;

    const sessionItem = actionElement.closest('.session-item');
    if (!sessionItem) return;

    const sessionId = sessionItem.dataset.id;
    const action = actionElement.dataset.action;

    if (action === 'export') {
      exportSession(sessionId);
    } else if (action === 'delete') {
      deleteSession(sessionId);
    }
  });

  // Delete all sessions button handler
  deleteAllButton?.addEventListener('click', function() {
    if (confirm('Are you sure you want to delete all recorded sessions?')) {
      deleteAllSessions();
    }
  });

  // Check initial recording state and load sessions
  chrome.storage.local.get(['isRecording', 'currentSessionId'], function(result) {
    console.log('Initial state:', result);
    isRecording = result.isRecording || false;
    currentSessionId = result.currentSessionId;
    updateUI();
    updateSessionsList();
    if (isRecording) {
      startUpdating();
    }
  });

  recordButton.addEventListener('click', function() {
    if (recordButton.disabled) return;
    
    console.log('Record button clicked, current state:', isRecording);
    
    // Disable button and show loading state
    recordButton.disabled = true;
    const buttonText = recordButton.querySelector('.button-text');
    const spinner = recordButton.querySelector('.spinner');
    const icon = recordButton.querySelector('.fas');
    
    if (!isRecording) {
      // Get current tab ID before starting recording
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTab = tabs[0];
        if (!currentTab) {
          showStatus('Cannot record: No active tab found', 'error');
          recordButton.disabled = false;
          return;
        }

        // Start new session
        currentSessionId = generateSessionId();
        buttonText.textContent = 'Starting...';
        spinner.style.display = 'inline-block';
        recordButton.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        recordButton.classList.add('bg-gray-400');
        
        chrome.storage.local.set({ 
          isRecording: true,
          currentSessionId,
          currentTabId: currentTab.id
        }, function() {
          console.log('Storage updated:', { isRecording, currentSessionId, currentTabId: currentTab.id });
          chrome.runtime.sendMessage({
            action: 'startRecording',
            sessionId: currentSessionId,
            tabId: currentTab.id
          }, function(response) {
            console.log('Background response:', response);
            isRecording = true;
            updateUI();
            updateSessionsList();
            startUpdating();
            recordButton.disabled = false;
            spinner.style.display = 'none';
            showStatus('Recording started for current tab', 'success');
          });
        });
      });
    } else {
      // Stop current session
      buttonText.textContent = 'Stopping...';
      spinner.style.display = 'inline-block';
      recordButton.classList.remove('bg-red-600', 'hover:bg-red-700');
      recordButton.classList.add('bg-gray-400');
      
      chrome.storage.local.set({ 
        isRecording: false,
        currentSessionId: null
      }, function() {
        console.log('Storage updated: recording stopped');
        chrome.runtime.sendMessage({
          action: 'stopRecording',
          sessionId: currentSessionId
        }, function(response) {
          console.log('Background response:', response);
          isRecording = false;
          currentSessionId = null;
          updateUI();
          stopUpdating();
          updateSessionsList();
          recordButton.disabled = false;
          spinner.style.display = 'none';
          showStatus('Recording stopped', 'success');
        });
      });
    }
  });
});
