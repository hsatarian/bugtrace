let networkRequests = new Map(); // Map of sessionId -> requests array
let isRecording = false;
let currentSessionId = null;

console.log('Background script initialized');

// Load JSZip
self.importScripts('lib/jszip.min.js');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  
  switch (message.action) {
    case 'startRecording':
      console.log('Starting recording for session:', message.sessionId);
      startRecording(message.sessionId);
      // Update storage with recording state
      chrome.storage.local.set({ 
        isRecording: true,
        currentSessionId: message.sessionId 
      }, () => {
        sendResponse({ success: true });
      });
      return true; // Keep channel open for async response
      
    case 'stopRecording':
      console.log('Stopping recording for session:', message.sessionId);
      stopRecording(message.sessionId);
      // Update storage with recording state
      chrome.storage.local.set({ 
        isRecording: false,
        currentSessionId: null 
      }, () => {
        sendResponse({ success: true });
      });
      return true; // Keep channel open for async response
      
    case 'exportData':
      console.log('Starting export for session:', message.sessionId);
      exportData(message.sessionId)
        .then((result) => {
          console.log('Export successful:', result);
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error('Export failed:', error);
          sendResponse({ success: false, error: error.toString() });
        });
      return true; // Keep message channel open for async response
  }
});

function startRecording(sessionId) {
  isRecording = true;
  currentSessionId = sessionId;
  networkRequests.set(sessionId, []);
  
  console.log('Recording started for session:', sessionId);
  
  // Store session start
  chrome.storage.local.get(['sessions'], function(result) {
    const sessions = result.sessions || [];
    sessions.push({
      id: sessionId,
      startTime: new Date().toISOString(),
      requests: 0
    });
    chrome.storage.local.set({ sessions });
  });
}

function stopRecording(sessionId) {
  console.log('Stopping recording, requests captured:', networkRequests.get(sessionId)?.length);
  isRecording = false;
  currentSessionId = null;
  
  // Save network requests to storage
  const requests = networkRequests.get(sessionId) || [];
  chrome.storage.local.get(['networkData'], function(result) {
    const networkData = result.networkData || {};
    networkData[sessionId] = requests;
    chrome.storage.local.set({ networkData }, () => {
      console.log('Network data saved to storage for session:', sessionId);
    });
  });
  
  // Update session info
  chrome.storage.local.get(['sessions'], function(result) {
    const sessions = result.sessions || [];
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex].requests = requests.length;
      chrome.storage.local.set({ sessions });
    }
  });
}

// Set up network request listeners
chrome.webRequest.onBeforeRequest.addListener(
  logRequest,
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

chrome.webRequest.onCompleted.addListener(
  logResponse,
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

function logRequest(details) {
  if (!isRecording || !currentSessionId) return;

  console.log('Request intercepted:', details.url);

  const request = {
    id: `#${details.requestId}`,
    timestamp: new Date().toISOString(),
    url: details.url,
    method: details.method,
    request_payload: {
      form_params: details.requestBody ? details.requestBody.formData : null,
      json_body: details.requestBody ? tryParseJSON(details.requestBody.raw) : null
    },
    stack_trace: new Error().stack,
    response_reference: `response_${details.requestId}.json`
  };

  const sessionRequests = networkRequests.get(currentSessionId) || [];
  sessionRequests.push(request);
  networkRequests.set(currentSessionId, sessionRequests);

  // Update request count in storage immediately
  chrome.storage.local.get(['networkData'], function(result) {
    const networkData = result.networkData || {};
    networkData[currentSessionId] = sessionRequests;
    chrome.storage.local.set({ networkData });
  });
}

function tryParseJSON(raw) {
  if (!raw || !raw[0]) return null;
  try {
    return JSON.parse(new TextDecoder().decode(raw[0].bytes));
  } catch {
    return null;
  }
}

function logResponse(details) {
  if (!isRecording || !currentSessionId) return;
  
  console.log('Response intercepted:', details.requestId);

  const sessionRequests = networkRequests.get(currentSessionId);
  if (!sessionRequests) return;

  const request = sessionRequests.find(req => req.id === `#${details.requestId}`);
  if (request) {
    // Store response data
    request.response_data = {
      status: details.statusCode,
      headers: details.responseHeaders,
      body: null // We can't get response bodies in MV3
    };
    
    // Update storage with response
    chrome.storage.local.get(['networkData'], function(result) {
      const networkData = result.networkData || {};
      networkData[currentSessionId] = sessionRequests;
      chrome.storage.local.set({ networkData });
    });
  }
}

async function exportData(sessionId) {
  console.log('Starting export process for session:', sessionId);
  
  // First try to get requests from storage
  const storageData = await new Promise((resolve) => {
    chrome.storage.local.get(['networkData'], (result) => {
      resolve(result.networkData || {});
    });
  });

  const requests = networkRequests.get(sessionId) || storageData[sessionId] || [];
  console.log('Number of requests:', requests.length);

  if (!requests || requests.length === 0) {
    throw new Error('No recorded data to export for this session');
  }

  try {
    // Create ZIP file
    const zip = new JSZip();
    
    // Add network summary
    const summary = {
      metadata: {
        start_time: requests[0].timestamp,
        end_time: requests[requests.length - 1].timestamp,
        total_requests: requests.length
      },
      requests: requests.map(req => ({
        id: req.id,
        timestamp: req.timestamp,
        url: req.url,
        method: req.method,
        request_payload: req.request_payload,
        response_status: req.response_data?.status,
        response_headers: req.response_data?.headers,
        response_reference: req.response_reference
      }))
    };
    
    zip.file('network_summary.json', JSON.stringify(summary, null, 2));
    
    // Add response files (only body and stack trace)
    requests.forEach(req => {
      if (req.response_data) {
        const responseData = {
          stack_trace: req.stack_trace,
          response: req.response_data.body
        };
        zip.file(req.response_reference, JSON.stringify(responseData, null, 2));
      }
    });
    
    // Generate ZIP file
    console.log('Generating ZIP file');
    const content = await zip.generateAsync({
      type: 'base64',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9
      }
    });
    
    const dataUrl = 'data:application/zip;base64,' + content;
    
    console.log('Initiating download');
    // Download the ZIP file
    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: dataUrl,
        filename: `network_trace_${sessionId}.zip`,
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('Download started:', downloadId);
          resolve(downloadId);
        }
      });
    });

    return { downloadId };
  } catch (error) {
    console.error('Export error:', error);
    throw error;
  }
}
