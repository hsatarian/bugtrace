# Bugtrace - Network Activity Recording Chrome Extension

A lightweight Chrome extension for recording and exporting network activity during debugging sessions. Perfect for developers who need to track and analyze network requests during development or troubleshooting.

## Features

- 🔴 One-click recording of network activity
- 📊 Real-time request count updates
- 🔍 Captures full request details including:
  - URL and method
  - Request payload (form data and JSON body)
  - Response status and headers
  - Stack trace for each request
- 📦 Export data as a structured JSON file containing:
  - Session metadata (start/end time, total requests)
  - Complete request details including:
    - Request ID and timestamp
    - URL and method
    - Request type
    - Tab ID
    - Request payload
    - Stack trace
    - Response data
- 🎯 Chrome Manifest V3 compliant
- 🔒 Secure with proper CSP implementation
- 💅 Modern UI with Tailwind CSS
- 📱 Responsive design

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/bugtrace.git
   cd bugtrace
   ```

2. Install dependencies and build the project:
   ```bash
   npm install
   npm run build
   ```

3. Open Chrome and navigate to `chrome://extensions/`

4. Enable "Developer mode" in the top right

5. Click "Load unpacked" and select the `bugtrace` directory

The extension should now appear in your Chrome toolbar.

## Usage

1. Click the Bugtrace icon in your Chrome toolbar
2. Click "Start Recording" to begin capturing network activity
3. Perform the actions you want to debug
4. Click "Stop Recording" when finished
5. Click "Export" to download the captured data as a JSON file

## Export Format

The exported JSON file contains:

```json
{
  "metadata": {
    "start_time": "2025-01-26T20:00:00.000Z",
    "end_time": "2025-01-26T20:01:00.000Z",
    "total_requests": 42
  },
  "requests": [
    {
      "id": "#request123",
      "timestamp": "2025-01-26T20:00:00.000Z",
      "url": "https://api.example.com/data",
      "method": "POST",
      "request_payload": {
        "form_params": {},
        "json_body": {"key": "value"}
      },
      "response_status": 200,
      "response_headers": [...],
      "response_reference": "response_123.json",
      "stack_trace": "Error: ...",
      "response": "response content (HTML/JSON/XML)"
    }
  ]
}
```

## Development Setup

```bash
# Install dependencies
npm install

# Build CSS (one-time)
npm run build

# Watch for CSS changes during development
npm run watch
```

### Tech Stack
- Chrome Extension Manifest V3
- Tailwind CSS for styling
- Font Awesome for icons

### Project Structure
```
bugtrace/
├── src/
│   └── input.css      # Tailwind CSS input file
├── dist/
│   └── output.css     # Generated CSS
├── popup.html         # Extension popup interface
├── background.js      # Service worker
├── manifest.json      # Extension manifest
└── tailwind.config.js # Tailwind configuration
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with Chrome Extension Manifest V3
- Uses JSZip for data compression
