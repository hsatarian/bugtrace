let isRecording = false;
let currentSessionId = null;

document.addEventListener('DOMContentLoaded', function() {
  const recordButton = document.getElementById('recordButton');
  const sessionsList = document.getElementById('sessionsList');
  const statusDiv = document.getElementById('status');

  console.log('Popup initialized');

  // Add event delegation for session actions
  sessionsList.addEventListener('click', function(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const sessionItem = button.closest('.session-item');
    if (!sessionItem) return;

    const sessionId = sessionItem.dataset.id;
    const action = button.dataset.action;

    if (action === 'export') {
      exportSession(sessionId);
    } else if (action === 'delete') {
      deleteSession(sessionId);
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
      // Start new session
      currentSessionId = generateSessionId();
      buttonText.textContent = 'Starting...';
      spinner.style.display = 'inline-block';
      recordButton.classList.remove('bg-blue-600', 'hover:bg-blue-700');
      recordButton.classList.add('bg-gray-400');
      
      chrome.storage.local.set({ 
        isRecording: true,
        currentSessionId
      }, function() {
        console.log('Storage updated:', { isRecording, currentSessionId });
        chrome.runtime.sendMessage({
          action: 'startRecording',
          sessionId: currentSessionId
        }, function(response) {
          console.log('Background response:', response);
          isRecording = true;
          updateUI();
          updateSessionsList();
          startUpdating();
          recordButton.disabled = false;
          spinner.style.display = 'none';
          showStatus('Recording started', 'success');
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

  function updateUI() {
    console.log('Updating UI:', { isRecording, currentSessionId });
    const buttonText = recordButton.querySelector('.button-text');
    const icon = recordButton.querySelector('.fas');
    
    buttonText.textContent = isRecording ? 'Stop Recording' : 'Start Recording';
    
    if (isRecording) {
      recordButton.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'focus:ring-blue-500', 'bg-gray-400');
      recordButton.classList.add('bg-red-600', 'hover:bg-red-700', 'focus:ring-red-500');
      icon.classList.add('text-red-200', 'animate-pulse');
    } else {
      recordButton.classList.remove('bg-red-600', 'hover:bg-red-700', 'focus:ring-red-500', 'bg-gray-400');
      recordButton.classList.add('bg-blue-600', 'hover:bg-blue-700', 'focus:ring-blue-500');
      icon.classList.remove('text-red-200', 'animate-pulse');
    }
  }

  function showStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = 'text-sm text-center h-6 fade-in ' + 
      (type === 'success' ? 'text-green-600' : 
       type === 'error' ? 'text-red-600' : 
       'text-gray-600');
    
    setTimeout(() => {
      statusDiv.textContent = '';
    }, 3000);
  }
});

function updateSessionsList() {
  chrome.storage.local.get(['sessions', 'networkData'], function(result) {
    const sessions = result.sessions || [];
    const networkData = result.networkData || {};
    console.log('Updating sessions list:', sessions);
    
    if (sessions.length === 0) {
      sessionsList.innerHTML = `
        <div class="p-4 text-center text-gray-500 text-sm">
          No recorded sessions yet
        </div>`;
      return;
    }

    // Sort sessions by start time, newest first
    const sortedSessions = [...sessions].sort((a, b) => 
      new Date(b.startTime) - new Date(a.startTime)
    );

    sessionsList.innerHTML = sortedSessions.map(session => {
      const requests = networkData[session.id] || [];
      const requestCount = requests.length;
      
      const mainDomain = requests.length > 0 ? 
        getDomainFromUrl(requests[0].url) : 
        'Recording...';

      return `
        <div class="session-item p-4 hover:bg-gray-50 transition-all duration-200" data-id="${session.id}">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="font-medium text-gray-900">${mainDomain}</div>
              <div class="text-sm text-gray-500 mt-1">
                ${formatDateTime(session.startTime)} • ${requestCount} request${requestCount !== 1 ? 's' : ''}
              </div>
            </div>
            <div class="flex space-x-2">
              <button class="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200" data-action="export">
                <i class="fas fa-download mr-1"></i> Export
              </button>
              <button class="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200" data-action="delete">
                <i class="fas fa-trash-alt mr-1"></i> Delete
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  });
}

let updateInterval = null;

function startUpdating() {
  if (!updateInterval) {
    updateInterval = setInterval(updateSessionsList, 1000);
  }
}

function stopUpdating() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

function generateSessionId() {
  const date = new Date();
  return `session_${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date.getSeconds().toString().padStart(2, '0')}`;
}

function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', { 
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getDomainFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Export and delete handlers
window.exportSession = function(sessionId) {
  console.log('Exporting session:', sessionId);
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = 'Preparing export...';
  
  chrome.runtime.sendMessage({
    action: 'exportData',
    sessionId: sessionId
  }, function(response) {
    console.log('Export response:', response);
    if (chrome.runtime.lastError) {
      console.error('Export failed:', chrome.runtime.lastError);
      statusDiv.textContent = `Export failed: ${chrome.runtime.lastError.message}`;
      return;
    }
    
    if (response && response.success) {
      statusDiv.textContent = 'Export completed!';
      setTimeout(() => {
        statusDiv.textContent = '';
      }, 3000);
    } else {
      const errorMessage = response && response.error ? response.error : 'Unknown error';
      console.error('Export failed:', errorMessage);
      statusDiv.textContent = `Export failed: ${errorMessage}`;
    }
  });
};

window.deleteSession = function(sessionId) {
  console.log('Deleting session:', sessionId);
  const statusDiv = document.getElementById('status');
  
  // Get both sessions and network data
  chrome.storage.local.get(['sessions', 'networkData'], function(result) {
    const sessions = result.sessions || [];
    const networkData = result.networkData || {};
    
    // Remove session from sessions list
    const updatedSessions = sessions.filter(s => s.id !== sessionId);
    
    // Remove network data for this session
    delete networkData[sessionId];
    
    // Update storage
    chrome.storage.local.set({ 
      sessions: updatedSessions,
      networkData: networkData 
    }, function() {
      if (chrome.runtime.lastError) {
        console.error('Delete failed:', chrome.runtime.lastError);
        statusDiv.textContent = 'Delete failed';
        return;
      }
      
      updateSessionsList();
      
      statusDiv.textContent = 'Session deleted';
      setTimeout(() => {
        statusDiv.textContent = '';
      }, 2000);
    });
  });
};
