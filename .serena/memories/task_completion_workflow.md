# SinBin Task Completion Workflow

## Code Quality Checks

### TypeScript Compilation
Since this project uses TypeScript, always ensure code compiles without errors:
```bash
# Build and check for TypeScript errors
npm run build
```

### Code Formatting
The project uses Prettier for code formatting. Apply formatting to maintain consistency:
```bash
# Format code with Prettier (if script exists)
npm run format

# Or manually format specific files
npx prettier --write src/**/*.ts
```

## Testing Workflow

### Manual Testing Steps
Since no automated test framework is configured, perform these manual verification steps:

1. **Build Verification**
   ```bash
   npm run build
   ```

2. **Start Application**
   ```bash
   npm run dev
   ```

3. **Verify Core Functionality**
   - Check server starts without errors
   - Verify Google Cloud connection test passes
   - Test overlay at http://localhost:3000/overlay.html
   - Test control panel at http://localhost:3000/control.html
   - Verify WebSocket connections work

4. **Audio System Test**
   ```bash
   # Linux - Test audio recording
   arecord -f cd -t wav -d 5 test.wav && aplay test.wav
   ```

## Environment Requirements

### Prerequisites Check
Before completing any task, ensure:
- Node.js 18+ is installed
- Google Cloud credentials are properly configured
- Audio recording system (SoX/ALSA) is installed
- All npm dependencies are installed

### Configuration Files
Verify these files are properly configured:
- `google-credentials.json` - Google Cloud service account
- `swear-jar-config.json` - Curse words and settings
- `GOOGLE_APPLICATION_CREDENTIALS` environment variable set

## Deployment Checklist

### Before Marking Task Complete
1. **Code Quality**
   - TypeScript compiles without errors
   - Code follows project conventions (4-space indentation, single quotes)
   - No console errors in browser

2. **Functionality**
   - Server starts successfully
   - Google Cloud connection established
   - Speech recognition initializes
   - WebSocket connections work
   - Frontend interfaces load properly

3. **Integration**
   - OBS browser source displays correctly
   - Control panel functions properly
   - Real-time communication works
   - Configuration persists correctly

### Production Deployment
For production deployments:
```bash
# Full production build
npm run clean
npm run build
npm start
```

## Common Issues to Check

### Audio Issues
- Verify microphone permissions
- Check audio device availability
- Ensure SoX/ALSA tools are installed

### Google Cloud Issues
- Verify credentials file exists and is valid
- Check billing is enabled on GCP account
- Confirm Speech-to-Text API is enabled

### Network Issues
- Ensure port 3000 is available
- Check firewall settings for local development
- Verify WebSocket connections aren't blocked

## Post-Task Verification Commands
```bash
# Check application health
curl http://localhost:3000/control.html

# Verify build output
ls -la dist/

# Check configuration
cat swear-jar-config.json
```