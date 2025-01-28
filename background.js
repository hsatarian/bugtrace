// Import JSZip
importScripts('lib/jszip.min.js');

let isRecording = false;
let currentSessionId = null;
let currentTabId = null;

// Initialize storage
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ sessions: [], networkData: {} });
});

// Helper function to parse form data
function parseFormData(formData) {
  const result = {};
  if (!formData) return result;
  
  try {
    // Handle URL encoded form data
    const params = new URLSearchParams(formData);
    params.forEach((value, key) => {
      result[key] = value;
    });
  } catch (e) {
    console.error('Form data parsing error:', e);
  }
  return result;
}

// Store requests as they come in
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (isRecording && details.tabId === currentTabId) {
      console.log('Recording request:', details.requestId);
      
      // Get the stack trace using debugger
      let stackTrace = '';
      try {
        const trace = await chrome.debugger.sendCommand(
          { tabId: details.tabId },
          "Runtime.getStackTrace"
        );
        stackTrace = JSON.stringify(trace, null, 2);
        console.log('Captured stack trace:', stackTrace);
      } catch (e) {
        console.error('Failed to get stack trace:', e);
      }

      // Parse request payload
      let payload = {};
      if (details.requestBody) {
        if (details.requestBody.formData) {
          payload.formData = details.requestBody.formData;
        }
        if (details.requestBody.raw) {
          payload.raw = details.requestBody.raw;
        }
      }

      const timestamp = new Date().toISOString();

      // Create request entry
      const requestEntry = {
        requestId: details.requestId,
        url: details.url,
        method: details.method,
        timestamp: timestamp,
        type: details.type,
        tabId: details.tabId,
        payload: payload,
        stackTrace: stackTrace,
        response: ''
      };

      // Update storage atomically
      chrome.storage.local.get(['networkData'], function(result) {
        const networkData = result.networkData || {};
        const requests = networkData[currentSessionId] || [];
        requests.push(requestEntry);
        networkData[currentSessionId] = requests;
        chrome.storage.local.set({ networkData: networkData }, () => {
          console.log('Stored request:', details.requestId);
        });
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// Handle response received
chrome.debugger.onEvent.addListener(async (source, method, params) => {
  if (!isRecording || source.tabId !== currentTabId) return;

  if (method === "Network.responseReceived") {
    console.log('Response received for request:', params.requestId);
    try {
      // Get response body
      console.log('Attempting to get response body for request:', params.requestId);
      const response = await chrome.debugger.sendCommand(
        { tabId: source.tabId },
        "Network.getResponseBody",
        { requestId: params.requestId }
      );

      // Update storage atomically
      chrome.storage.local.get(['networkData'], function(result) {
        console.log('Current network data:', result.networkData);
        const networkData = result.networkData || {};
        const requests = networkData[currentSessionId] || [];
        
        // Find the request by ID
        const requestIndex = requests.findIndex(req => req.requestId === params.requestId);
        console.log('Found request at index:', requestIndex);

        if (requestIndex !== -1) {
          requests[requestIndex].response = response.body;
          networkData[currentSessionId] = requests;
          chrome.storage.local.set({ networkData: networkData }, () => {
            console.log('Updated response for request:', params.requestId);
          });
        } else {
          // If request not found, create a new entry
          const requestEntry = {
            requestId: params.requestId,
            timestamp: new Date().toISOString(),
            response: response.body
          };
          requests.push(requestEntry);
          networkData[currentSessionId] = requests;
          chrome.storage.local.set({ networkData: networkData }, () => {
            console.log('Created new entry for response:', params.requestId);
          });
        }
      });
    } catch (e) {
      console.error('Failed to get response body:', e, 'Request ID:', params.requestId);
    }
  }
});

// Attach debugger when recording starts
async function attachDebugger(tabId) {
  try {
    await chrome.debugger.attach({ tabId }, "1.0");
    await chrome.debugger.sendCommand({ tabId }, "Network.enable");
    console.log('Debugger attached successfully');
  } catch (e) {
    console.error('Failed to attach debugger:', e);
  }
}

// Detach debugger when recording stops
async function detachDebugger(tabId) {
  try {
    await chrome.debugger.detach({ tabId });
    console.log('Debugger detached successfully');
  } catch (e) {
    console.error('Failed to detach debugger:', e);
  }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request);
  
  switch (request.action) {
    case 'startRecording':
      isRecording = true;
      currentSessionId = request.sessionId;
      currentTabId = request.tabId;
      
      // Attach debugger
      attachDebugger(currentTabId);
      
      // Create new session
      chrome.storage.local.get(['sessions'], function(result) {
        const sessions = result.sessions || [];
        sessions.push({
          id: currentSessionId,
          startTime: new Date().toISOString(),
          tabId: currentTabId
        });
        
        chrome.storage.local.set({ sessions: sessions }, function() {
          sendResponse({ success: true });
        });
      });
      return true;
      
    case 'stopRecording':
      const stoppingSessionId = currentSessionId;
      
      // Detach debugger
      detachDebugger(currentTabId);
      
      // Stop recording immediately
      isRecording = false;
      currentSessionId = null;
      currentTabId = null;

      // Check for requests and clean up if needed
      chrome.storage.local.get(['sessions', 'networkData'], function(result) {
        const networkData = result.networkData || {};
        const sessions = result.sessions || [];
        const sessionRequests = networkData[stoppingSessionId] || [];
        
        if (sessionRequests.length === 0) {
          // Remove empty session
          const updatedSessions = sessions.filter(s => s.id !== stoppingSessionId);
          delete networkData[stoppingSessionId];
          
          chrome.storage.local.set({ 
            sessions: updatedSessions,
            networkData: networkData 
          }, () => {
            console.log('Empty session removed:', stoppingSessionId);
            sendResponse({ success: true });
          });
        } else {
          // Update session with request count
          const sessionIndex = sessions.findIndex(s => s.id === stoppingSessionId);
          if (sessionIndex !== -1) {
            sessions[sessionIndex].requests = sessionRequests.length;
            chrome.storage.local.set({ sessions }, () => {
              sendResponse({ success: true });
            });
          }
        }
      });
      return true;
      
    case 'exportData':
      if (!request.sessionId) {
        sendResponse({ success: false, error: 'No session ID provided' });
        return true;
      }

      chrome.storage.local.get(['networkData', 'sessions'], function(result) {
        const networkData = result.networkData || {};
        const sessions = result.sessions || [];
        const sessionData = networkData[request.sessionId] || [];
        const session = sessions.find(s => s.id === request.sessionId);
        
        try {
          // Create network summary with full data
          const summary = {
            metadata: {
              start_time: session?.startTime || new Date().toISOString(),
              end_time: new Date().toISOString(),
              total_requests: sessionData.length
            },
            requests: sessionData.map(req => ({
              id: req.requestId,
              timestamp: req.timestamp,
              url: req.url,
              method: req.method,
              type: req.type,
              tabId: req.tabId,
              payload: req.payload || {},
              stack_trace: req.stackTrace || "",
              response: req.response || ""
            }))
          };

          // Create zip with single file
          const zip = new JSZip();
          zip.file('network_summary.json', JSON.stringify(summary, null, 2));

          // Generate zip file
          zip.generateAsync({ type: "base64" })
            .then(function(content) {
              const dataUrl = 'data:application/zip;base64,' + content;
              chrome.downloads.download({
                url: dataUrl,
                filename: `bugtrace-session-${request.sessionId}.zip`,
                saveAs: true
              }, (downloadId) => {
                if (chrome.runtime.lastError) {
                  console.error('Export failed:', chrome.runtime.lastError);
                  sendResponse({ 
                    success: false, 
                    error: chrome.runtime.lastError.message 
                  });
                } else {
                  sendResponse({ success: true });
                }
              });
            });
        } catch (error) {
          console.error('Export error:', error);
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        }
      });
      return true;

    case 'deleteSession':
      chrome.storage.local.get(['sessions', 'networkData'], function(result) {
        const sessions = result.sessions || [];
        const networkData = result.networkData || {};
        
        const updatedSessions = sessions.filter(s => s.id !== request.sessionId);
        delete networkData[request.sessionId];
        
        chrome.storage.local.set({ 
          sessions: updatedSessions,
          networkData: networkData 
        }, function() {
          sendResponse({ success: true });
        });
      });
      return true;

    case 'deleteAllSessions':
      chrome.storage.local.set({ 
        sessions: [],
        networkData: {} 
      }, function() {
        sendResponse({ success: true });
      });
      return true;
  }
});
