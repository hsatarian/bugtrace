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
    console.log('Record button clicked, current state:', isRecording);
    isRecording = !isRecording;
    
    if (isRecording) {
      // Start new session
      currentSessionId = generateSessionId();
      chrome.storage.local.set({ 
        isRecording,
        currentSessionId
      }, function() {
        console.log('Storage updated:', { isRecording, currentSessionId });
        chrome.runtime.sendMessage({
          action: 'startRecording',
          sessionId: currentSessionId
        }, function(response) {
          console.log('Background response:', response);
          updateUI();
          updateSessionsList();
          startUpdating();
        });
      });
    } else {
      // Stop current session
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
          currentSessionId = null;
          updateUI();
          stopUpdating();
          updateSessionsList();
        });
      });
    }
  });

  function updateUI() {
    console.log('Updating UI:', { isRecording, currentSessionId });
    recordButton.textContent = isRecording ? 'Stop Recording' : 'Start Recording';
    recordButton.classList.toggle('recording', isRecording);
    statusDiv.textContent = isRecording ? 'Recording in progress...' : '';
  }
});

function updateSessionsList() {
  chrome.storage.local.get(['sessions', 'networkData'], function(result) {
    const sessions = result.sessions || [];
    const networkData = result.networkData || {};
    console.log('Updating sessions list:', sessions);
    
    if (sessions.length === 0) {
      sessionsList.innerHTML = '<div class="no-sessions">No recorded sessions yet</div>';
      return;
    }

    // Sort sessions by start time, newest first
    const sortedSessions = [...sessions].sort((a, b) => 
      new Date(b.startTime) - new Date(a.startTime)
    );

    sessionsList.innerHTML = sortedSessions.map(session => {
      const requests = networkData[session.id] || [];
      const requestCount = requests.length;
      
      // Get the first request's domain (main tab domain)
      const mainDomain = requests.length > 0 ? 
        getDomainFromUrl(requests[0].url) : 
        'Recording...'; // Show "Recording..." instead of "unknown"

      return `
        <div class="session-item" data-id="${session.id}">
          <div class="session-info">
            <div class="session-title">${mainDomain}</div>
            <div class="session-details">
              ${formatDateTime(session.startTime)} | ${requestCount} request${requestCount !== 1 ? 's' : ''}
            </div>
          </div>
          <div class="session-actions">
            <button class="export-btn" data-action="export">Export</button>
            <button class="delete-btn" data-action="delete">Delete</button>
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
