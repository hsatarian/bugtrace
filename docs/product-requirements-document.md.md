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

### 4.1 Main Export File: `network_summary.json`
- **JSON Structure**:
  ```json
  {
    "metadata": {
      "start_time": "2025-01-26T19:30:11.123Z",
      "end_time": "2025-01-26T19:35:22.456Z",
      "total_requests": 42
    },
    "requests": [
      {
        "id": "#1",
        "timestamp": "2025-01-26T19:30:12.345Z",
        "url": "https://api.example.com/data?param=value",
        "method": "GET",
        "request_payload": {
          "form_params": { /* form data here */ },
          "json_body": { /* JSON body here */ }
        },
        "stack_trace": "Error: ...\n    at ...",
        "response_reference": "response_1.json"
      }
      // ...
    ]
  }
