"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const speech_1 = __importDefault(require("@google-cloud/speech"));
const { record } = require('node-record-lpcm16');
const fs_1 = __importDefault(require("fs"));
class SwearJarService {
    constructor() {
        this.app = (0, express_1.default)();
        this.server = (0, http_1.createServer)(this.app);
        this.io = new socket_io_1.Server(this.server, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
            },
        });
        this.speechClient = new speech_1.default.SpeechClient();
        this.swearCount = 0;
        this.isListening = false;
        this.recentTranscripts = new Set();
        this.currentRecognizeStream = null;
        this.currentRecording = null;
        this.isRestarting = false;
        this.config = {
            predefinedCurseWords: [
                'fuck',
                'shit',
                'damn',
                'hell',
                'bitch',
                'ass',
                'asshole',
                'bastard',
                'crap',
                'piss',
                'cock',
                'dick',
                'pussy',
                'tits',
                'goddamn',
                'motherfucker',
                'bullshit',
                'dammit',
                'fuckin',
                'fucking',
                'shitty',
                'bitchy',
                'dickhead',
                'douchebag',
            ],
            customCurseWords: [],
            swearCount: 0,
        };
        this.setupExpress();
        this.setupWebSocket();
        this.loadConfig();
        this.testGoogleCloudConnection();
    }
    async testGoogleCloudConnection() {
        try {
            console.log('🧪 Testing Google Cloud Speech-to-Text connection...');
            const client = new speech_1.default.SpeechClient();
            await client.initialize();
            console.log('✅ Google Cloud connection successful');
        }
        catch (error) {
            console.error('❌ Google Cloud connection test failed:', error.message);
            if (error.message.includes('billing')) {
                console.error('🚨 BILLING NOT ENABLED: Go to Google Cloud Console > Billing');
                console.error('   Without billing, Speech-to-Text stops after first utterance!');
            }
            if (error.message.includes('quota')) {
                console.error('🚨 QUOTA EXCEEDED: Check APIs & Services > Quotas in GCP');
            }
            if (error.message.includes('credentials')) {
                console.error('🚨 CREDENTIALS: Check GOOGLE_APPLICATION_CREDENTIALS environment variable');
            }
            console.error('⚠️  Streaming speech recognition may not work properly');
        }
    }
    setupExpress() {
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.static('public'));
        this.app.get('/', (req, res) => {
            res.redirect('/control.html');
        });
        this.app.get('/api/count', (req, res) => {
            res.json({ count: this.swearCount });
        });
        this.app.post('/api/reset', (req, res) => {
            this.swearCount = 0;
            this.saveConfig();
            this.io.emit('countUpdate', this.swearCount);
            res.json({ success: true, count: this.swearCount });
        });
        this.app.post('/api/add-word', (req, res) => {
            const { word } = req.body;
            if (word &&
                !this.config.customCurseWords.includes(word.toLowerCase())) {
                this.config.customCurseWords.push(word.toLowerCase());
                this.saveConfig();
                res.json({
                    success: true,
                    customWords: this.config.customCurseWords,
                });
            }
            else {
                res.status(400).json({
                    error: 'Word already exists or is invalid',
                });
            }
        });
        this.app.delete('/api/remove-word/:word', (req, res) => {
            const word = req.params.word.toLowerCase();
            this.config.customCurseWords = this.config.customCurseWords.filter((w) => w !== word);
            this.saveConfig();
            res.json({
                success: true,
                customWords: this.config.customCurseWords,
            });
        });
        this.app.get('/api/words', (req, res) => {
            res.json({
                predefined: this.config.predefinedCurseWords,
                custom: this.config.customCurseWords,
            });
        });
        this.app.post('/api/sound-settings', (req, res) => {
            const { enabled, volume } = req.body;
            this.io.emit('soundSettings', { enabled, volume });
            res.json({ success: true });
        });
        this.app.post('/api/test-sound', (req, res) => {
            this.io.emit('testSound');
            res.json({ success: true });
        });
    }
    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log('Browser source connected');
            socket.emit('countUpdate', this.swearCount);
            socket.on('startListening', () => {
                if (!this.isListening) {
                    this.startSpeechRecognition();
                }
            });
            socket.on('stopListening', () => {
                this.stopSpeechRecognition();
            });
            socket.on('themeUpdate', (theme) => {
                this.io.emit('themeUpdate', theme);
                console.log(`🎨 Theme updated: ${theme.primaryColor} → ${theme.secondaryColor}`);
            });
            socket.on('disconnect', () => {
                console.log('Browser source disconnected');
            });
        });
    }
    async startSpeechRecognition() {
        if (this.isListening || this.isRestarting)
            return;
        console.log('🎤 Starting speech recognition...');
        this.isListening = true;
        const request = {
            config: {
                encoding: 'LINEAR16',
                sampleRateHertz: 16000,
                languageCode: 'en-US',
                enableAutomaticPunctuation: false,
                model: 'latest_long',
                enableWordTimeOffsets: false,
                enableWordConfidence: true,
                maxAlternatives: 1,
            },
            interimResults: true,
            singleUtterance: false,
        };
        try {
            if (this.currentRecognizeStream) {
                this.currentRecognizeStream.removeAllListeners();
                this.currentRecognizeStream.end();
                this.currentRecognizeStream = null;
            }
            const streamStartTime = Date.now();
            console.log(`🟢 Creating new recognition stream at ${new Date().toLocaleTimeString()}`);
            this.currentRecognizeStream = this.speechClient
                .streamingRecognize(request)
                .on('error', (err) => {
                console.error(`❌ Speech error after ${Date.now() - streamStartTime}ms:`, err.message);
                if (err.message.includes('credentials') ||
                    err.message.includes('Could not load the default credentials')) {
                    console.error('🚨 CREDENTIALS: Check GOOGLE_APPLICATION_CREDENTIALS environment variable');
                    console.log('⏸️ Stopping restart attempts due to credential issues');
                    this.isListening = false;
                    return;
                }
                if (err.message.includes('billing') ||
                    err.message.includes('quota')) {
                    console.error('🚨 BILLING/QUOTA ISSUE: Enable billing in Google Cloud Console!');
                }
                this.restartRecognition(2000);
            })
                .on('data', (data) => {
                if (data.results[0] && data.results[0].alternatives[0]) {
                    const transcript = data.results[0].alternatives[0].transcript
                        .toLowerCase()
                        .trim();
                    const confidence = data.results[0].alternatives[0].confidence || 0;
                    const streamAge = Date.now() - streamStartTime;
                    if (data.results[0].isFinal) {
                        console.log(`👂 [${Math.round(streamAge / 1000)}s] "${transcript}" (conf: ${confidence.toFixed(2)}, final: true)`);
                    }
                    if (transcript &&
                        (data.results[0].isFinal || confidence > 0.5)) {
                        this.checkForCurseWords(transcript, data.results[0].isFinal);
                    }
                }
            })
                .on('end', () => {
                const streamDuration = Date.now() - streamStartTime;
                console.log(`🔚 Stream ended naturally after ${Math.round(streamDuration / 1000)}s - restarting`);
                this.restartRecognition(500);
            })
                .on('close', () => {
                const streamDuration = Date.now() - streamStartTime;
                console.log(`🔒 Stream closed after ${Math.round(streamDuration / 1000)}s`);
            });
            this.startRecording();
            console.log('✅ Speech recognition active - will restart on stream end');
        }
        catch (error) {
            console.error('❌ Failed to start speech recognition:', error.message);
            if (error.message.includes('credentials') ||
                error.message.includes('Could not load the default credentials')) {
                console.log('⏸️ Stopping due to credential issues');
                this.isListening = false;
                return;
            }
            this.restartRecognition(2000);
        }
    }
    startRecording() {
        try {
            if (this.currentRecording) {
                if (this.currentRecording.stop) {
                    this.currentRecording.stop();
                }
                this.currentRecording = null;
            }
            let recordProgram = 'rec';
            if (process.platform === 'linux') {
                recordProgram = 'arecord';
            }
            console.log(`Using recording program: ${recordProgram}`);
            this.currentRecording = record({
                sampleRateHertz: 16000,
                threshold: 0.1,
                verbose: false,
                recordProgram: recordProgram,
                silence: '0.5',
            });
            if (!this.currentRecording ||
                typeof this.currentRecording.stream !== 'function') {
                throw new Error('Recording object is invalid. Make sure audio recording software is installed.');
            }
            const recordingStream = this.currentRecording.stream();
            recordingStream
                .on('error', (err) => {
                console.error('🎤 Recording stream error:', err.message);
                if (this.isListening && !this.isRestarting) {
                    this.restartRecognition(3000);
                }
            })
                .pipe(this.currentRecognizeStream);
            console.log('🎙️ Audio recording started');
        }
        catch (error) {
            console.error('❌ Failed to start recording:', error.message);
            throw error;
        }
    }
    restartRecognition(delay = 500) {
        if (this.isRestarting) {
            console.log('⏭️ Restart already in progress, skipping...');
            return;
        }
        this.isRestarting = true;
        console.log(`🔄 Restarting in ${delay}ms...`);
        if (this.currentRecognizeStream) {
            try {
                this.currentRecognizeStream.removeAllListeners();
                this.currentRecognizeStream.destroy();
            }
            catch (err) {
            }
            this.currentRecognizeStream = null;
        }
        if (this.currentRecording) {
            try {
                if (this.currentRecording.stop) {
                    this.currentRecording.stop();
                }
            }
            catch (err) {
            }
            this.currentRecording = null;
        }
        this.isListening = false;
        setTimeout(() => {
            this.isRestarting = false;
            this.startSpeechRecognition();
        }, delay);
    }
    stopSpeechRecognition() {
        console.log('🛑 Stopping speech recognition...');
        this.isListening = false;
        if (this.currentRecognizeStream) {
            try {
                this.currentRecognizeStream.removeAllListeners();
                this.currentRecognizeStream.destroy();
            }
            catch (err) {
            }
            this.currentRecognizeStream = null;
        }
        if (this.currentRecording) {
            try {
                if (this.currentRecording.stop) {
                    this.currentRecording.stop();
                }
            }
            catch (err) {
            }
            this.currentRecording = null;
        }
    }
    checkForCurseWords(transcript, isFinal = false) {
        const allCurseWords = [
            ...this.config.predefinedCurseWords,
            ...this.config.customCurseWords,
        ];
        const words = transcript.split(/\s+/);
        let foundCurses = 0;
        const foundWords = [];
        words.forEach((word) => {
            const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
            if (cleanWord && allCurseWords.includes(cleanWord)) {
                const wordId = `${cleanWord}_${Math.floor(Date.now() / 1000)}`;
                if (!this.recentTranscripts.has(wordId)) {
                    foundCurses++;
                    foundWords.push(cleanWord);
                    this.recentTranscripts.add(wordId);
                    setTimeout(() => {
                        this.recentTranscripts.delete(wordId);
                    }, 2000);
                }
            }
        });
        if (foundCurses > 0) {
            this.swearCount += foundCurses;
            this.saveConfig();
            this.io.emit('countUpdate', this.swearCount);
            console.log(`🤬 Curse word${foundCurses > 1 ? 's' : ''} detected: ${foundWords.join(', ')} | Total: ${this.swearCount} | Final: ${isFinal}`);
        }
    }
    loadConfig() {
        try {
            if (fs_1.default.existsSync('swear-jar-config.json')) {
                const configData = fs_1.default.readFileSync('swear-jar-config.json', 'utf8');
                const savedConfig = JSON.parse(configData);
                this.config = { ...this.config, ...savedConfig };
                this.swearCount = this.config.swearCount;
                console.log(`Loaded config. Current swear count: ${this.swearCount}`);
            }
        }
        catch (error) {
            console.error('Error loading config:', error);
        }
    }
    saveConfig() {
        try {
            this.config.swearCount = this.swearCount;
            fs_1.default.writeFileSync('swear-jar-config.json', JSON.stringify(this.config, null, 2));
        }
        catch (error) {
            console.error('Error saving config:', error);
        }
    }
    start(port = 3000) {
        this.server.listen(port, () => {
            console.log(`Swear Jar server running on http://localhost:${port}`);
            console.log(`Browser Source URL: http://localhost:${port}/overlay.html`);
            console.log(`Control Panel: http://localhost:${port}/control.html`);
        });
    }
}
const swearJar = new SwearJarService();
swearJar.start();
//# sourceMappingURL=server.js.map