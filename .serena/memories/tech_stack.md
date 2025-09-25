# SinBin Tech Stack

## Runtime Environment
- **Node.js**: Version 18+ (specified in package.json engines)
- **Platform**: Cross-platform (Windows, macOS, Linux)

## Core Dependencies
### Production Dependencies
- **@google-cloud/speech**: ^6.0.1 - Google Cloud Speech-to-Text API integration
- **express**: ^4.18.2 - Web server framework
- **node-record-lpcm16**: ^1.0.1 - Audio recording from microphone
- **socket.io**: ^4.7.4 - Real-time bidirectional communication

### Development Dependencies
- **typescript**: ^5.3.3 - TypeScript compiler
- **ts-node**: ^10.9.2 - TypeScript execution for Node.js
- **ts-node-dev**: ^2.0.0 - Development server with auto-restart
- **@types/express**: ^4.17.21 - Express type definitions
- **@types/node**: ^20.10.6 - Node.js type definitions
- **rimraf**: ^5.0.5 - Cross-platform rm -rf utility

## Frontend Technologies
- **HTML5**: Static HTML files for overlay and control panel
- **WebSocket/Socket.IO**: Real-time communication with server
- **Web Audio API**: Generated sound effects (no external audio files)
- **CSS3**: Styling for overlay and control interfaces

## External Services
- **Google Cloud Platform**: 
  - Speech-to-Text API for real-time speech recognition
  - Requires billing enabled account
  - Service account authentication

## Audio Processing
- **SoX (Sound eXchange)**: Required for audio recording on various platforms
  - Windows: SoX Audio Tools
  - macOS: Available via Homebrew
  - Linux: ALSA utilities + SoX

## Build System
- **TypeScript Compiler**: Compiles TS to JS in dist/ directory
- **Target**: ES2020 with CommonJS modules
- **Source Maps**: Enabled for debugging

## Development Tools
- **Prettier**: Code formatting with custom configuration
- **ts-node-dev**: Development server with hot reload capability