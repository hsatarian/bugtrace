# product-requirements-document.md

## 1. App Overview
**Name**: Bugtrace Plugin  
**Description**: A Chrome extension that allows software engineers to start and stop recording network traffic, then export all recorded network calls into JSON files. These files can be used by programming LLMs (like Windsurf) to help troubleshoot bugs.  
**Tagline**: “Record, Export, and Debug Your Network Calls Effortlessly”

## 2. Target Audience
- **Primary Users**: Software engineers and developers.
  - **Demographics**: Tech-savvy individuals of various experience levels who frequently debug web applications.
  - **Goals**: Quickly capture network traffic during specific interactions to diagnose issues.
  - **Pain Points**: Difficulty pinpointing which files or endpoints are causing bugs without detailed network traces.

## 3. Key Features
1. **Start/Stop Recording**:  
   - Users press a button to begin recording network traffic, and press again to stop.
2. **Export Network Traffic**:  
   - Data is exported in JSON format, ensuring machine readability and easy debugging.
3. **Minimal UI**:  
   - Simple, minimalistic interface to keep the extension lightweight.
4. **Reference-Based Response Files**:  
   - Each request can reference a separate detailed response file, avoiding clutter in the main export.
5. **ZIP Archive**:  
   - All files (summary plus response files) are packaged together for quick sharing or uploading to LLMs.

## 4. Export Format

The extension exports captured data in a single JSON file with the following structure:

```json
{
  "metadata": {
    "start_time": "2025-01-28T01:24:58.194Z",
    "end_time": "2025-01-28T01:25:08.954Z",
    "total_requests": 13
  },
  "requests": [
    {
      "id": "2357",
      "timestamp": "2025-01-28T01:24:59.301Z",
      "url": "https://example.com/api/endpoint",
      "method": "GET",
      "type": "xmlhttprequest",
      "tabId": 145549063,
      "payload": {},
      "stack_trace": "Error: ...",
      "response": "response content"
    }
  ]
}
```

#### Data Fields

- **metadata**: Session information
  - `start_time`: Recording start timestamp (ISO 8601)
  - `end_time`: Recording end timestamp (ISO 8601)
  - `total_requests`: Total number of captured requests

- **requests**: Array of captured requests
  - `id`: Unique request identifier
  - `timestamp`: Request timestamp (ISO 8601)
  - `url`: Request URL
  - `method`: HTTP method
  - `type`: Request type (e.g., xmlhttprequest, fetch, image)
  - `tabId`: Chrome tab identifier
  - `payload`: Request payload data
  - `stack_trace`: JavaScript stack trace at request time
  - `response`: Response content
