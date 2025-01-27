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

// Get stack trace using Chrome's debugger API
async function getStackTrace(tabId) {
  try {
    const trace = await chrome.debugger.sendCommand(
      { tabId },
      "Runtime.getStackTrace"
    );
    return JSON.stringify(trace, null, 2);
  } catch (e) {
    console.error('Failed to get stack trace:', e);
    return null;
  }
}

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

// Enhanced response handling with fallback
chrome.debugger.onEvent.addListener(async (source, method, params) => {
  if (!isRecording || source.tabId !== currentTabId) return;

  if (method === "Network.responseReceived") {
    try {
      const response = await chrome.debugger.sendCommand(
        { tabId: source.tabId },
        "Network.getResponseBody",
        { requestId: params.requestId }
      );

      chrome.storage.local.get(['networkData'], function(result) {
        const networkData = result.networkData || {};
        const requests = networkData[currentSessionId] || [];
        const requestIndex = requests.findIndex(req => req.requestId === params.requestId);

        if (requestIndex !== -1) {
          // Update existing request
          requests[requestIndex].response = response.body;
        } else {
          // Create new entry if request not found (fallback)
          requests.push({
            requestId: params.requestId,
            timestamp: new Date().toISOString(),
            response: response.body,
            url: params.response.url,
            method: 'GET', // Default method since we don't have the original request
            type: params.type || 'unknown',
            tabId: source.tabId,
            stackTrace: null
          });
        }
        
        networkData[currentSessionId] = requests;
        chrome.storage.local.set({ networkData: networkData });
      });
    } catch (e) {
      console.error('Failed to get response body:', e);
    }
  }
});

// Set up web request listener for capturing request bodies
chrome.webRequest.onBeforeRequest.addListener(
  async function(details) {
    if (isRecording && details.tabId === currentTabId) {
      try {
        const stackTrace = await getStackTrace(details.tabId);
        const requestEntry = {
          requestId: details.requestId,
          url: details.url,
          method: details.method,
          timestamp: new Date().toISOString(),
          type: details.type,
          tabId: details.tabId,
          payload: details.requestBody ? parseFormData(details.requestBody.formData) : null,
          stackTrace: stackTrace,
          response: null
        };

        // Store immediately
        chrome.storage.local.get(['networkData'], function(result) {
          const networkData = result.networkData || {};
          const requests = networkData[currentSessionId] || [];
          requests.push(requestEntry);
          networkData[currentSessionId] = requests;
          chrome.storage.local.set({ networkData: networkData });
        });
      } catch (e) {
        console.error('Error processing request:', e);
      }
    }
    return {};
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request);
  
  switch (request.action) {
    case 'startRecording':
      isRecording = true;
      currentSessionId = request.sessionId;
      currentTabId = request.tabId;
      attachDebugger(request.tabId);
      sendResponse({ success: true });
      break;
      
    case 'stopRecording':
      isRecording = false;
      detachDebugger(currentTabId);
      currentTabId = null;
      currentSessionId = null;
      sendResponse({ success: true });
      break;
      
    case 'deleteSession':
      chrome.storage.local.get(['sessions', 'networkData'], function(result) {
        const sessions = result.sessions.filter(s => s.id !== request.sessionId);
        const networkData = result.networkData;
        delete networkData[request.sessionId];
        
        chrome.storage.local.set({ 
          sessions: sessions,
          networkData: networkData
        }, () => {
          sendResponse({ success: true });
        });
      });
      return true; // Keep message channel open for async response
  }
});
