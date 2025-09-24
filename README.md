# 🫙 SinBin - Real-time Twitch Overlay

A real-time speech recognition overlay that detects curse words while streaming and adds them to a visual "swear jar" with sound effects. Perfect for Twitch streamers who want to gamify their language!

## ✨ Features

-   🎤 **Real-time speech recognition** using Google Cloud Speech-to-Text
-   🫙 **Visual swear jar** that fills up as you curse
-   🔊 **Pleasant coin sound effects** with volume control
-   📊 **Live counter** with smooth animations
-   ⚙️ **Customizable curse words** - add your own words
-   🎮 **OBS Browser Source** ready
-   📱 **Web-based control panel** for management
-   💾 **Persistent counting** - keeps track between streams
-   🔄 **Auto-restart system** - maintains continuous listening

## 📋 Prerequisites

### Required Software

1. **Node.js 18+** - [Download here](https://nodejs.org/)
2. **Audio recording tools:**
    - **Windows:** [SoX Audio Tools](http://sox.sourceforge.net/Dist/sox-14.4.2-win32.exe)
    - **macOS:** `brew install sox`
    - **Linux:** `sudo apt-get install alsa-utils sox`

### Google Cloud Account

You'll need a Google Cloud account with billing enabled (don't worry - costs are minimal, ~$0.50-2.00/month for typical streaming).

## 🚀 Installation

### 1. Clone and Setup

```bash
# Clone or create project directory
mkdir sinbin
cd sinbin
git clone https://github.com/Bots/sinbin.git
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Google Cloud Setup

1. **Create a Project:**

    - Go to [Google Cloud Console](https://console.cloud.google.com/)
    - Create a new project or select existing one

2. **Enable Speech-to-Text API:**

    - Search for "Speech-to-Text API" in the console
    - Click "Enable"

3. **Enable Billing (CRITICAL):**

    - Go to **Billing** → **Link a billing account**
    - Add payment method
    - _Without billing, the app will only process the first sentence!_

4. **Create Service Account:**
    - Go to **APIs & Services** → **Credentials**
    - Click **Create Credentials** → **Service Account**
    - Name: `sinbin`
    - Download the JSON key file
    - Save as `google-credentials.json` in your project root

### 4. Set Environment Variable

```bash
# Windows (Command Prompt)
set GOOGLE_APPLICATION_CREDENTIALS=google-credentials.json

# Windows (PowerShell)
$env:GOOGLE_APPLICATION_CREDENTIALS="google-credentials.json"

# macOS/Linux
export GOOGLE_APPLICATION_CREDENTIALS=google-credentials.json
```

### 5. Test Audio Setup

```bash
# Linux/macOS - Test if recording works
arecord -f cd -t wav -d 5 test.wav && aplay test.wav

# Windows - Test if SoX is installed
sox --version
```

## 📁 Project Structure

Create these files in your project directory:

```
sinbin/
├── src/
│   └── server.ts                    # Main server code
├── public/
│   ├── overlay.html                 # Browser source overlay
│   └── control.html                 # Control panel
├── types/
│   └── node-record-lpcm16.d.ts      # TypeScript definitions
├── package.json                     # Dependencies
├── tsconfig.json                    # TypeScript config
├── google-credentials.json          # Your GCP credentials
└── README.md                        # This file
```

## ▶️ Running the Application

### Start the Server

```bash
# Development mode (auto-restart)
npm run dev

# Or production mode
npm run build
npm start
```

### Verify Setup

You should see:

```
🧪 Testing Google Cloud Speech-to-Text connection...
✅ Google Cloud connection successful
🎤 Starting speech recognition...
✅ Speech recognition active - AUTO-RESTART every 45s
Swear Jar server running on http://localhost:3000
Browser Source URL: http://localhost:3000/overlay.html
Control Panel: http://localhost:3000/control.html
```

## 🎥 OBS Setup

1. **Add Browser Source:**

    - Click **+** in Sources → **Browser Source**
    - Name: "SinBin"
    - **URL:** `http://localhost:3000/overlay.html`
    - **Width:** 400px
    - **Height:** 200px
    - **Custom CSS:** (optional)
        ```css
        body {
            background-color: rgba(0, 0, 0, 0);
            margin: 0px auto;
            overflow: hidden;
        }
        ```

2. **Position the overlay** wherever you want on your stream

## 🎮 Usage

### Control Panel

Access at `http://localhost:3000/control.html`:

-   **View current count** and connection status
-   **Reset counter** for new streams
-   **Add/remove custom curse words**
-   **Adjust sound settings** (volume, enable/disable)
-   **Test the sound** anytime
-   **Get browser source URL** for OBS

### Customization

-   **Add custom words:** Type in control panel and click "Add Word"
-   **Adjust volume:** Use slider in Sound Settings
-   **Predefined words:** Edit the list in `server.ts` if needed

## 🛠️ Troubleshooting

### Common Issues

**"Only processes first sentence"**

-   ❌ **Billing not enabled** - Most common cause
-   ✅ Go to Google Cloud Console → Billing and add payment method

**"Recording error" or "No audio detected"**

-   ❌ **Audio permissions** - Grant microphone access
-   ❌ **Recording software missing** - Install SoX/ALSA tools
-   ❌ **Wrong microphone** - Check system default recording device

**"Cannot GET /control"**

-   ❌ **Files missing** - Make sure `public/control.html` exists
-   ❌ **Server not started** - Run `npm run dev`

**TypeScript errors**

-   ❌ **Node version** - Requires Node.js 18+
-   ❌ **Dependencies** - Run `npm install` again

### Debug Commands

```bash
# Check audio devices (Linux)
arecord -l

# Test microphone (Linux)
arecord -f cd -t wav -d 5 test.wav

# Check Node version
node --version

# Verify project structure
ls -la public/
```

### Connection Test

The app automatically tests your Google Cloud connection on startup:

-   ✅ **"Google Cloud connection successful"** - You're good!
-   ❌ **"BILLING NOT ENABLED"** - Enable billing in GCP
-   ❌ **"CREDENTIALS"** - Check your JSON file and environment variable

## 💰 Costs

Google Cloud Speech-to-Text pricing for typical streaming:

-   **Streaming recognition:** ~$0.006 per 15-second chunk
-   **Typical 4-hour stream:** $0.40 - $1.20
-   **Monthly cost:** $2-10 depending on usage

_Much cheaper than missing donations due to excessive swearing! 😄_

## 🎯 Tips for Streamers

1. **Reset counter** at the start of each stream
2. **Set a donation goal** based on swear count
3. **Add your catchphrases** as custom curse words
4. **Adjust volume** so it doesn't overpower your commentary
5. **Position overlay** where viewers can easily see it

## 🔧 Advanced Configuration

### Modify Curse Words

Edit `src/server.ts` to change the predefined list:

```typescript
predefinedCurseWords: ['your', 'custom', 'words', 'here']
```

### Audio Settings

-   **Volume:** Adjustable in control panel (0-100%)
-   **Sound files:** Generated using Web Audio API (no external files needed)
-   **Multiple sounds:** Supports rapid-fire detection without cutting off

### Performance Tuning

-   **Restart interval:** Currently 45 seconds (adjustable in code)
-   **Confidence threshold:** 70% for interim results
-   **Audio quality:** 16kHz sample rate for optimal recognition

## 📝 License

MIT License - Feel free to modify and distribute!

## 🤝 Contributing

Found a bug or want to add features? Contributions welcome!

## 🆘 Support

If you run into issues:

1. Check the troubleshooting section above
2. Verify all prerequisites are installed
3. Make sure Google Cloud billing is enabled
4. Check browser console for errors (F12)

---

**Happy streaming! May your swear jar overflow with coins! 🪙💰**
