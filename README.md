# SinBin

A real-time streaming overlay application that detects and tracks profanity usage during live streams. Features a minimalistic, customizable interface designed for content creators who want to monitor their language without distracting from their content.

## Features

- **Real-time Speech Recognition**: Continuous audio processing using Google Cloud Speech-to-Text API
- **Minimalistic Design**: Clean, professional overlay that won't distract from your stream
- **Full Customization**: Complete control over colors, transparency, layout, and sizing
- **Multiple Layouts**: Vertical and horizontal arrangements with flexible positioning
- **Live Transcription**: Optional display of real-time speech transcription
- **OBS Integration**: Optimized for OBS Browser Source with recommended settings
- **Persistent Storage**: Automatic saving of counts and configuration between sessions
- **Professional Control Panel**: Comprehensive interface for managing all overlay settings

## Quick Start

### Prerequisites

- Node.js 18 or later
- Google Cloud Platform account with billing enabled
- Audio recording software (SoX) installed on your system

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd sinbin
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up Google Cloud credentials:
   - Create a Google Cloud project with the Speech-to-Text API enabled
   - Create a service account with the "Speech Client" role
   - Download the credentials JSON file
   - Set the environment variable:
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS="path/to/your/credentials.json"
     ```

4. Install audio recording software:
   - **Windows**: Download SoX Audio Tools from the official website
   - **macOS**: `brew install sox`
   - **Linux**: `sudo apt-get install sox alsa-utils`

### Running the Application

Start the development server:
```bash
npm run dev
```

The application will be available at:
- Control Panel: http://localhost:3000
- Overlay: http://localhost:3000/overlay.html

## OBS Setup

1. Add a new Browser Source in OBS
2. Set the URL to: `http://localhost:3000/overlay.html`
3. Recommended dimensions:
   - Vertical layout: 400x300px
   - Horizontal layout: 600x200px
4. Check "Shutdown source when not visible" and "Refresh browser when scene becomes active"

## Configuration

### Audio Setup

Ensure your microphone is properly configured and accessible to the application. The system will automatically detect your default input device.

### Customization Options

The control panel provides comprehensive customization options:

- **Layout**: Choose between vertical and horizontal arrangements
- **Colors**: Full color control with alpha transparency for all elements
- **Sizing**: Adjustable dimensions for trash bin and status indicators
- **Visibility**: Toggle individual elements on/off
- **Positioning**: Control transcript placement relative to the main icon

### Word Management

- **Predefined Words**: Built-in list of common profanity
- **Custom Words**: Add your own words to monitor
- **Real-time Updates**: Changes take effect immediately without restart

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript for production
- `npm start` - Run compiled production server
- `npm run clean` - Remove compiled files

### Project Structure

```
src/
├── server.ts          # Main server application
├── types/             # TypeScript type definitions
└── styles/            # CSS styling files

public/
├── overlay.html       # OBS overlay interface
├── control.html       # Management control panel
└── styles/            # Static CSS assets
```

## Architecture

The application uses a three-tier architecture:

1. **Backend Server**: Node.js with Express handling API endpoints and WebSocket connections
2. **Speech Processing**: Google Cloud Speech-to-Text with infinite streaming implementation
3. **Frontend Clients**: Separate interfaces for overlay display and control management

Real-time communication between components is handled via Socket.IO, ensuring immediate updates across all connected clients.

## Troubleshooting

### Audio Issues

- Verify microphone permissions in your operating system
- Check that SoX is properly installed and accessible
- Test audio recording with: `arecord -d 5 test.wav` (Linux) or equivalent

### Google Cloud Issues

- Ensure billing is enabled on your Google Cloud project
- Verify the Speech-to-Text API is activated
- Check that your service account has the correct permissions
- Confirm the credentials file path is correct

### Connection Problems

- Check that no firewall is blocking port 3000
- Verify the server is running and accessible
- Look for error messages in the browser console and server logs

## API Reference

### REST Endpoints

- `GET /api/count` - Get current profanity count
- `POST /api/reset` - Reset counter to zero
- `GET /api/words` - List all monitored words
- `POST /api/add-word` - Add custom word
- `DELETE /api/remove-word/:word` - Remove custom word
- `POST /api/sound-settings` - Update audio preferences
- `POST /api/test-sound` - Trigger test sound

### WebSocket Events

- `countUpdate` - Counter value changed
- `transcriptUpdate` - New transcription available
- `themeUpdate` - Color scheme modified
- `displayOptionsUpdate` - Layout or appearance changed

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with appropriate tests
4. Ensure code follows the existing style conventions
5. Submit a pull request with a clear description

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Support

For issues, questions, or feature requests, please open an issue on the project repository.