# SinBin Suggested Commands

## Development Commands

### Primary Development Commands
```bash
# Start development server with auto-restart
npm run dev

# Start development server with file watching (hot reload)
npm run dev:watch

# Build TypeScript to JavaScript
npm run build

# Start production server (requires build first)
npm start
```

### Build and Deployment
```bash
# Clean compiled output directory
npm run clean

# Full build process
npm run clean && npm run build

# Production deployment sequence
npm run build && npm start
```

## Project Management

### Package Management
```bash
# Install all dependencies
npm install

# Install new dependency
npm install <package-name>

# Install new dev dependency
npm install --save-dev <package-name>

# Update dependencies
npm update
```

### Git Operations
```bash
# Check status
git status

# Stage changes
git add .

# Commit changes
git commit -m "description"

# Push changes
git push origin main
```

## System-Specific Audio Setup

### Linux Commands
```bash
# List audio recording devices
arecord -l

# Test microphone recording (5 seconds)
arecord -f cd -t wav -d 5 test.wav

# Play test recording
aplay test.wav

# Install audio dependencies
sudo apt-get install alsa-utils sox
```

### macOS Commands
```bash
# Install SoX via Homebrew
brew install sox

# Check SoX installation
sox --version
```

### Windows Commands
```cmd
# Check SoX installation
sox --version

# Set environment variable (Command Prompt)
set GOOGLE_APPLICATION_CREDENTIALS=google-credentials.json

# Set environment variable (PowerShell)
$env:GOOGLE_APPLICATION_CREDENTIALS="google-credentials.json"
```

## Google Cloud Setup
```bash
# Set credentials environment variable (Linux/macOS)
export GOOGLE_APPLICATION_CREDENTIALS=google-credentials.json

# Verify Node.js version (must be 18+)
node --version

# Check if credentials file exists
ls -la google-credentials.json
```

## File Operations
```bash
# List project structure
ls -la

# Check public files
ls -la public/

# View TypeScript config
cat tsconfig.json

# Check package.json scripts
cat package.json
```

## Debugging and Monitoring
```bash
# Run with verbose logging
DEBUG=* npm run dev

# Monitor server logs
tail -f server.log

# Check process running on port 3000
lsof -i :3000

# Kill process on port 3000
kill $(lsof -t -i:3000)
```

## Application URLs
- **Main Server**: http://localhost:3000
- **OBS Browser Source**: http://localhost:3000/overlay.html
- **Control Panel**: http://localhost:3000/control.html