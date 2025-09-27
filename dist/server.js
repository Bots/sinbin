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
const { v1p1beta1 } = speech_1.default;
const { record } = require('node-record-lpcm16');
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const database_1 = require("./database/database");
const chat_monitor_1 = require("./services/chat-monitor");
const multer_1 = __importDefault(require("multer"));
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
        this.speechClient = new v1p1beta1.SpeechClient();
        this.swearCount = 0;
        this.isListening = false;
        this.recentTranscripts = new Set();
        this.currentSessionId = null;
        this.autoResetTimer = null;
        this.lastPenaltyTime = 0;
        this.currentRecognizeStream = null;
        this.currentRecording = null;
        this.streamingLimit = 290000;
        this.restartCounter = 0;
        this.audioInput = [];
        this.lastAudioInput = [];
        this.resultEndTime = 0;
        this.isFinalEndTime = 0;
        this.finalRequestEndTime = 0;
        this.newStream = true;
        this.bridgingOffset = 0;
        this.lastTranscriptWasFinal = false;
        this.streamStartTime = 0;
        this.config = {
            predefinedCurseWords: [
                'fuck', 'shit', 'damn', 'hell', 'bitch', 'ass', 'asshole', 'bastard',
                'crap', 'piss', 'cock', 'dick', 'pussy', 'tits', 'goddamn',
                'motherfucker', 'bullshit', 'dammit', 'fuckin', 'fucking',
                'shitty', 'bitchy', 'dickhead', 'douchebag'
            ],
            customCurseWords: [],
            swearCount: 0
        };
        this.database = new database_1.Database();
        this.chatMonitor = new chat_monitor_1.ChatMonitor(this.database);
        this.setupExpress();
        this.setupWebSocket();
        this.initializeDatabase();
        this.testGoogleCloudConnection();
    }
    async initializeDatabase() {
        try {
            await this.database.initialize();
            const legacyConfigExists = fs_1.default.existsSync('swear-jar-config.json');
            if (legacyConfigExists) {
                console.log('Found legacy JSON config, migrating to database...');
                this.loadLegacyConfig();
                await this.database.migrateFromJSON(this.config);
                fs_1.default.renameSync('swear-jar-config.json', 'swear-jar-config.json.backup');
                console.log('Legacy config backed up as swear-jar-config.json.backup');
            }
            await this.loadCurrentCount();
            await this.startSession();
            await this.loadCustomWords();
            await this.startAutoResetTimer();
            await this.initializeChatMonitor();
            console.log('Database initialization completed');
        }
        catch (error) {
            console.error('Database initialization failed:', error);
            throw error;
        }
    }
    async loadCurrentCount() {
        try {
            const session = await this.database.getActiveSession();
            if (session) {
                this.swearCount = session.total_penalties;
                this.currentSessionId = session.id ?? null;
            }
            else {
                this.swearCount = 0;
            }
        }
        catch (error) {
            console.error('Error loading current count:', error);
            this.swearCount = 0;
        }
    }
    async loadCustomWords() {
        try {
            const customWordsJson = await this.database.getSetting('custom_curse_words');
            if (customWordsJson) {
                this.config.customCurseWords = JSON.parse(customWordsJson);
            }
        }
        catch (error) {
            console.error('Error loading custom words:', error);
            this.config.customCurseWords = [];
        }
    }
    async startSession() {
        try {
            const activeSession = await this.database.getActiveSession();
            if (!activeSession) {
                this.currentSessionId = await this.database.createSession();
                console.log(`Started new session: ${this.currentSessionId}`);
            }
            else {
                this.currentSessionId = activeSession.id ?? null;
                console.log(`Resumed session: ${this.currentSessionId}`);
            }
        }
        catch (error) {
            console.error('Error starting session:', error);
        }
    }
    async startAutoResetTimer() {
        try {
            const enabled = await this.database.getSetting('auto_reset_enabled');
            const duration = await this.database.getSetting('auto_reset_duration');
            if (enabled === 'true' && duration) {
                const durationMs = parseInt(duration) * 60 * 1000;
                this.scheduleAutoReset(durationMs);
                console.log(`Auto-reset enabled: ${duration} minutes`);
            }
        }
        catch (error) {
            console.error('Error starting auto-reset timer:', error);
        }
    }
    scheduleAutoReset(durationMs) {
        if (this.autoResetTimer) {
            clearTimeout(this.autoResetTimer);
        }
        this.autoResetTimer = setTimeout(async () => {
            const timeSinceLastPenalty = Date.now() - this.lastPenaltyTime;
            if (timeSinceLastPenalty >= durationMs) {
                await this.resetCounter(true);
                this.io.emit('autoResetTriggered', { resetTime: Date.now() });
                console.log('Auto-reset triggered after clean period');
            }
            this.scheduleAutoReset(durationMs);
        }, durationMs);
    }
    async initializeChatMonitor() {
        try {
            const chatEnabled = await this.database.getSetting('chat_enabled');
            if (chatEnabled === 'true') {
                const channel = await this.database.getSetting('chat_channel');
                const username = await this.database.getSetting('chat_username');
                const oauth = await this.database.getSetting('chat_oauth');
                if (channel) {
                    await this.chatMonitor.initialize(channel, username || undefined, oauth || undefined);
                    await this.chatMonitor.updateSessionId(this.currentSessionId);
                    console.log(`Chat monitoring enabled for channel: ${channel}`);
                }
                else {
                    console.log('Chat enabled but no channel specified');
                }
            }
            else {
                console.log('Chat monitoring disabled');
            }
        }
        catch (error) {
            console.error('Error initializing chat monitor:', error);
        }
    }
    loadLegacyConfig() {
        try {
            if (fs_1.default.existsSync('swear-jar-config.json')) {
                const configData = fs_1.default.readFileSync('swear-jar-config.json', 'utf8');
                const savedConfig = JSON.parse(configData);
                this.config = { ...this.config, ...savedConfig };
                console.log(`Loaded legacy config. Swear count: ${this.config.swearCount}`);
            }
        }
        catch (error) {
            console.error('Error loading legacy config:', error);
        }
    }
    async testGoogleCloudConnection() {
        try {
            console.log('Testing Google Cloud Speech-to-Text connection...');
            const client = new speech_1.default.SpeechClient();
            await client.initialize();
            console.log('Google Cloud connection established successfully');
        }
        catch (error) {
            console.error('Google Cloud connection test failed:', error.message);
            if (error.message.includes('billing')) {
                console.error('BILLING ISSUE: Please enable billing in Google Cloud Console');
                console.error('Speech-to-Text requires active billing to work beyond initial quota');
            }
            if (error.message.includes('quota')) {
                console.error('QUOTA EXCEEDED: Check your API quotas in Google Cloud Console');
            }
            if (error.message.includes('credentials')) {
                console.error('CREDENTIALS: Verify GOOGLE_APPLICATION_CREDENTIALS environment variable');
            }
            console.warn('Speech recognition may not function properly without valid credentials');
        }
    }
    setupExpress() {
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.static('public'));
        const soundsDir = path_1.default.join(process.cwd(), 'public', 'sounds');
        if (!fs_1.default.existsSync(soundsDir)) {
            fs_1.default.mkdirSync(soundsDir, { recursive: true });
        }
        this.app.use('/sounds', express_1.default.static(soundsDir));
        const storage = multer_1.default.diskStorage({
            destination: function (req, file, cb) {
                cb(null, soundsDir);
            },
            filename: function (req, file, cb) {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const extension = path_1.default.extname(file.originalname);
                cb(null, file.fieldname + '-' + uniqueSuffix + extension);
            }
        });
        const upload = (0, multer_1.default)({
            storage: storage,
            limits: {
                fileSize: 5 * 1024 * 1024
            },
            fileFilter: function (req, file, cb) {
                if (file.mimetype.startsWith('audio/')) {
                    cb(null, true);
                }
                else {
                    cb(new Error('Only audio files are allowed'));
                }
            }
        });
        this.app.get('/', (req, res) => {
            res.redirect('/control.html');
        });
        this.app.get('/api/count', (req, res) => {
            res.json({ count: this.swearCount });
        });
        this.app.post('/api/reset', async (req, res) => {
            try {
                await this.resetCounter();
                res.json({ success: true, count: this.swearCount });
            }
            catch (error) {
                console.error('Error resetting counter:', error);
                res.status(500).json({ error: 'Failed to reset counter' });
            }
        });
        this.app.post('/api/add-word', async (req, res) => {
            const { word } = req.body;
            if (word && !this.config.customCurseWords.includes(word.toLowerCase())) {
                try {
                    this.config.customCurseWords.push(word.toLowerCase());
                    await this.database.setSetting('custom_curse_words', JSON.stringify(this.config.customCurseWords));
                    res.json({
                        success: true,
                        customWords: this.config.customCurseWords,
                    });
                }
                catch (error) {
                    console.error('Error adding word:', error);
                    res.status(500).json({ error: 'Failed to add word' });
                }
            }
            else {
                res.status(400).json({
                    error: 'Word already exists or is invalid',
                });
            }
        });
        this.app.delete('/api/remove-word/:word', async (req, res) => {
            const word = req.params.word.toLowerCase();
            try {
                this.config.customCurseWords = this.config.customCurseWords.filter((w) => w !== word);
                await this.database.setSetting('custom_curse_words', JSON.stringify(this.config.customCurseWords));
                res.json({
                    success: true,
                    customWords: this.config.customCurseWords,
                });
            }
            catch (error) {
                console.error('Error removing word:', error);
                res.status(500).json({ error: 'Failed to remove word' });
            }
        });
        this.app.get('/api/words', (req, res) => {
            res.json({
                predefined: this.config.predefinedCurseWords,
                custom: this.config.customCurseWords,
            });
        });
        this.app.get('/api/stats', async (req, res) => {
            try {
                const micCount = await this.database.getPenaltyCount('mic');
                const chatCount = await this.database.getPenaltyCount('chat');
                const session = await this.database.getActiveSession();
                const topUsers = await this.database.getTopUsers(10);
                const thresholds = await this.database.getThresholds();
                res.json({
                    penalties: {
                        total: micCount + chatCount,
                        mic: micCount,
                        chat: chatCount,
                        session: session?.total_penalties || 0
                    },
                    users: topUsers,
                    session: session,
                    thresholds: thresholds
                });
            }
            catch (error) {
                console.error('Error getting stats:', error);
                res.status(500).json({ error: 'Failed to get stats' });
            }
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
        this.app.get('/api/thresholds', async (req, res) => {
            try {
                const thresholds = await this.database.getThresholds();
                res.json({ success: true, data: thresholds });
            }
            catch (error) {
                console.error('Error getting thresholds:', error);
                res.status(500).json({ error: 'Failed to get thresholds' });
            }
        });
        this.app.post('/api/settings', async (req, res) => {
            try {
                const { key, value } = req.body;
                await this.database.setSetting(key, value);
                if (key === 'auto_reset_enabled' || key === 'auto_reset_duration') {
                    await this.startAutoResetTimer();
                }
                res.json({ success: true });
            }
            catch (error) {
                console.error('Error saving setting:', error);
                res.status(500).json({ error: 'Failed to save setting' });
            }
        });
        this.app.get('/api/settings/:key', async (req, res) => {
            try {
                const value = await this.database.getSetting(req.params.key);
                res.json({ success: true, data: value });
            }
            catch (error) {
                console.error('Error getting setting:', error);
                res.status(500).json({ error: 'Failed to get setting' });
            }
        });
        this.app.post('/api/chat/connect', async (req, res) => {
            try {
                const { channel, username, oauth } = req.body;
                await this.database.setSetting('chat_enabled', 'true');
                await this.database.setSetting('chat_channel', channel);
                if (username)
                    await this.database.setSetting('chat_username', username);
                if (oauth)
                    await this.database.setSetting('chat_oauth', oauth);
                await this.chatMonitor.initialize(channel, username, oauth);
                await this.chatMonitor.updateSessionId(this.currentSessionId);
                res.json({ success: true, message: 'Chat monitoring started' });
            }
            catch (error) {
                console.error('Error connecting to chat:', error);
                res.status(500).json({ error: 'Failed to connect to chat' });
            }
        });
        this.app.post('/api/chat/disconnect', async (req, res) => {
            try {
                await this.chatMonitor.disconnect();
                await this.database.setSetting('chat_enabled', 'false');
                res.json({ success: true, message: 'Chat monitoring stopped' });
            }
            catch (error) {
                console.error('Error disconnecting from chat:', error);
                res.status(500).json({ error: 'Failed to disconnect from chat' });
            }
        });
        this.app.get('/api/chat/status', (req, res) => {
            const status = this.chatMonitor.getConnectionStatus();
            res.json({ success: true, data: status });
        });
        this.app.get('/api/chat/stats', async (req, res) => {
            try {
                const stats = await this.chatMonitor.getChatStats();
                res.json({ success: true, data: stats });
            }
            catch (error) {
                console.error('Error getting chat stats:', error);
                res.status(500).json({ error: 'Failed to get chat stats' });
            }
        });
        this.app.get('/api/users', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 10;
                const users = await this.database.getTopUsers(limit);
                res.json({ success: true, data: users });
            }
            catch (error) {
                console.error('Error getting users:', error);
                res.status(500).json({ error: 'Failed to get users' });
            }
        });
        this.app.post('/api/sounds/upload', upload.single('soundFile'), async (req, res) => {
            try {
                if (!req.file) {
                    res.status(400).json({ error: 'No file uploaded' });
                    return;
                }
                const { category = 'penalty', description = '' } = req.body;
                const soundData = {
                    filename: req.file.filename,
                    originalName: req.file.originalname,
                    category: category,
                    description: description,
                    fileSize: req.file.size,
                    uploadDate: new Date().toISOString(),
                    url: `/sounds/${req.file.filename}`
                };
                const existingSounds = await this.database.getSetting('custom_sounds') || '[]';
                const sounds = JSON.parse(existingSounds);
                sounds.push(soundData);
                await this.database.setSetting('custom_sounds', JSON.stringify(sounds));
                res.json({
                    success: true,
                    data: soundData
                });
                return;
            }
            catch (error) {
                console.error('Error uploading sound:', error);
                res.status(500).json({ error: 'Failed to upload sound file' });
                return;
            }
        });
        this.app.get('/api/sounds', async (req, res) => {
            try {
                const soundsJson = await this.database.getSetting('custom_sounds') || '[]';
                const sounds = JSON.parse(soundsJson);
                res.json({ success: true, data: sounds });
            }
            catch (error) {
                console.error('Error getting sounds:', error);
                res.status(500).json({ error: 'Failed to get sounds' });
            }
        });
        this.app.delete('/api/sounds/:filename', async (req, res) => {
            try {
                const filename = req.params.filename;
                const soundsDir = path_1.default.join(process.cwd(), 'public', 'sounds');
                const filePath = path_1.default.join(soundsDir, filename);
                const existingSounds = await this.database.getSetting('custom_sounds') || '[]';
                const sounds = JSON.parse(existingSounds);
                const updatedSounds = sounds.filter((sound) => sound.filename !== filename);
                await this.database.setSetting('custom_sounds', JSON.stringify(updatedSounds));
                if (fs_1.default.existsSync(filePath)) {
                    fs_1.default.unlinkSync(filePath);
                }
                res.json({ success: true, message: 'Sound file deleted' });
            }
            catch (error) {
                console.error('Error deleting sound:', error);
                res.status(500).json({ error: 'Failed to delete sound file' });
            }
        });
        this.app.post('/api/sounds/play', (req, res) => {
            const { filename, volume = 0.5 } = req.body;
            this.io.emit('soundPlay', {
                file: `/sounds/${filename}`,
                volume: volume
            });
            res.json({ success: true, message: 'Sound play triggered' });
        });
    }
    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log('Browser source connected');
            socket.emit('countUpdate', this.swearCount);
            socket.on('startListening', () => {
                if (!this.isListening) {
                    this.startSpeechRecognition();
                    this.io.emit('statusUpdate', 'listening');
                }
            });
            socket.on('stopListening', () => {
                this.stopSpeechRecognition();
                this.io.emit('statusUpdate', 'connected');
            });
            socket.on('themeUpdate', (theme) => {
                this.io.emit('themeUpdate', theme);
                console.log(`Theme updated: ${theme.primaryColor} → ${theme.secondaryColor}`);
            });
            socket.on('displayOptionsUpdate', (options) => {
                this.io.emit('displayOptionsUpdate', options);
                console.log('Display options updated:', options);
            });
            socket.on('disconnect', () => {
                console.log('Browser source disconnected');
            });
        });
    }
    async startSpeechRecognition() {
        if (this.isListening)
            return;
        console.log('Starting continuous speech recognition...');
        this.isListening = true;
        this.restartCounter = 0;
        this.audioInput = [];
        this.lastAudioInput = [];
        this.resultEndTime = 0;
        this.isFinalEndTime = 0;
        this.finalRequestEndTime = 0;
        this.newStream = true;
        this.bridgingOffset = 0;
        this.lastTranscriptWasFinal = false;
        this.startStream();
    }
    startStream() {
        this.audioInput = [];
        this.streamStartTime = Date.now();
        const config = {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: 'en-US',
            enableAutomaticPunctuation: false,
            model: 'latest_long',
            enableWordTimeOffsets: false,
            enableWordConfidence: true,
            maxAlternatives: 1,
        };
        const request = {
            config,
            interimResults: true,
            singleUtterance: false,
        };
        console.log(`Creating speech recognition stream ${this.restartCounter + 1}`);
        this.currentRecognizeStream = this.speechClient
            .streamingRecognize(request)
            .on('error', (err) => {
            console.error('Speech recognition stream error:', err.message);
            if (err.code === 11) {
                this.restartStream();
            }
            else if (err.message.includes('credentials') ||
                err.message.includes('Could not load the default credentials')) {
                console.error('Authentication failed - check GOOGLE_APPLICATION_CREDENTIALS');
                console.log('Stopping speech recognition due to credential issues');
                this.isListening = false;
                return;
            }
            else {
                console.error('Unexpected API error:', err);
                this.restartStream();
            }
        })
            .on('data', (stream) => this.speechCallback(stream));
        setTimeout(() => {
            if (this.isListening && this.currentRecognizeStream) {
                console.log(`Stream limit approaching (${this.streamingLimit / 1000}s), restarting...`);
                this.restartStream();
            }
        }, this.streamingLimit);
        if (!this.currentRecording) {
            this.startRecording();
        }
    }
    speechCallback(stream) {
        if (!stream.results?.[0]?.alternatives?.[0]) {
            return;
        }
        this.resultEndTime =
            stream.results[0].resultEndTime.seconds * 1000 +
                Math.round(stream.results[0].resultEndTime.nanos / 1000000);
        const correctedTime = this.resultEndTime -
            this.bridgingOffset +
            this.streamingLimit * this.restartCounter;
        const transcript = stream.results[0].alternatives[0].transcript
            .toLowerCase()
            .trim();
        const confidence = stream.results[0].alternatives[0].confidence || 0;
        const streamAge = Date.now() - this.streamStartTime;
        if (stream.results[0].isFinal) {
            console.log(`Final transcript (${Math.round(streamAge / 1000)}s): "${transcript}" (confidence: ${confidence.toFixed(2)})`);
            this.isFinalEndTime = this.resultEndTime;
            this.lastTranscriptWasFinal = true;
            if (transcript) {
                this.checkForCurseWords(transcript, true);
                this.io.emit('transcriptUpdate', transcript);
            }
        }
        else {
            if (transcript && confidence > 0.3) {
                this.checkForCurseWords(transcript, false);
                this.io.emit('transcriptUpdate', transcript);
            }
            this.lastTranscriptWasFinal = false;
        }
    }
    restartStream() {
        if (this.currentRecognizeStream) {
            this.currentRecognizeStream.end();
            this.currentRecognizeStream.removeListener('data', this.speechCallback);
            this.currentRecognizeStream = null;
        }
        if (this.resultEndTime > 0) {
            this.finalRequestEndTime = this.isFinalEndTime;
        }
        this.resultEndTime = 0;
        this.lastAudioInput = [];
        this.lastAudioInput = [...this.audioInput];
        this.restartCounter++;
        if (!this.lastTranscriptWasFinal) {
            console.log('Mid-sentence stream restart detected');
        }
        console.log(`Restarting speech recognition stream ${this.restartCounter} (${(this.streamingLimit * this.restartCounter) / 1000}s total)`);
        this.newStream = true;
        if (this.isListening) {
            this.startStream();
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
            console.log(`Initializing audio recording with ${recordProgram}`);
            this.currentRecording = record({
                sampleRateHertz: 16000,
                threshold: 0,
                silence: 1000,
                keepSilence: true,
                recordProgram: recordProgram,
            });
            if (!this.currentRecording || typeof this.currentRecording.stream !== 'function') {
                throw new Error('Audio recording initialization failed. Verify recording software is installed.');
            }
            const recordingStream = this.currentRecording.stream();
            recordingStream
                .on('error', (err) => {
                console.error('Audio recording error:', err.message);
                if (this.isListening) {
                    this.restartStream();
                }
            })
                .on('data', (chunk) => {
                if (this.newStream && this.lastAudioInput.length !== 0) {
                    const chunkTime = this.streamingLimit / this.lastAudioInput.length;
                    if (chunkTime !== 0) {
                        if (this.bridgingOffset < 0) {
                            this.bridgingOffset = 0;
                        }
                        if (this.bridgingOffset > this.finalRequestEndTime) {
                            this.bridgingOffset = this.finalRequestEndTime;
                        }
                        const chunksFromMS = Math.floor((this.finalRequestEndTime - this.bridgingOffset) / chunkTime);
                        this.bridgingOffset = Math.floor((this.lastAudioInput.length - chunksFromMS) * chunkTime);
                        for (let i = chunksFromMS; i < this.lastAudioInput.length; i++) {
                            if (this.currentRecognizeStream) {
                                this.currentRecognizeStream.write(this.lastAudioInput[i]);
                            }
                        }
                    }
                    this.newStream = false;
                }
                this.audioInput.push(chunk);
                if (this.currentRecognizeStream) {
                    this.currentRecognizeStream.write(chunk);
                }
            });
            console.log('Audio recording started successfully');
        }
        catch (error) {
            console.error('Failed to start audio recording:', error.message);
            throw error;
        }
    }
    stopSpeechRecognition() {
        console.log('Stopping speech recognition...');
        this.isListening = false;
        if (this.streamingLimit) {
            clearTimeout(this.streamingLimit);
        }
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
        this.audioInput = [];
        this.lastAudioInput = [];
        this.bridgingOffset = 0;
        this.finalRequestEndTime = 0;
    }
    async checkForCurseWords(transcript, isFinal = false) {
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
            await this.addPenalties(foundWords, 'mic');
            const wordList = foundWords.join(', ');
            const finalStatus = isFinal ? 'final' : 'interim';
            console.log(`Detected ${foundCurses} profanity word${foundCurses > 1 ? 's' : ''}: ${wordList} | Total: ${this.swearCount} | Status: ${finalStatus}`);
        }
    }
    async addPenalties(words, source, username) {
        try {
            for (const word of words) {
                await this.database.addPenalty({
                    word,
                    source,
                    username,
                    ...(this.currentSessionId !== null ? { session_id: this.currentSessionId } : {})
                });
                this.swearCount++;
                this.lastPenaltyTime = Date.now();
                this.io.emit('penaltyDetected', {
                    word,
                    source,
                    username,
                    timestamp: Date.now(),
                    sessionId: this.currentSessionId
                });
                this.io.emit('animationTrigger', {
                    type: 'binShake',
                    data: { word, intensity: 5 }
                });
            }
            if (this.currentSessionId) {
                const session = await this.database.getActiveSession();
                if (session) {
                    await this.database.updateSession(this.currentSessionId, {
                        total_penalties: session.total_penalties + words.length,
                        mic_penalties: source === 'mic' ? session.mic_penalties + words.length : session.mic_penalties,
                        chat_penalties: source === 'chat' ? session.chat_penalties + words.length : session.chat_penalties
                    });
                }
            }
            await this.checkThresholds();
            this.io.emit('countUpdate', this.swearCount);
        }
        catch (error) {
            console.error('Error adding penalties:', error);
        }
    }
    async checkThresholds() {
        try {
            const thresholds = await this.database.getThresholds();
            const currentThreshold = thresholds
                .filter(t => this.swearCount >= t.count)
                .sort((a, b) => b.count - a.count)[0];
            if (currentThreshold) {
                this.io.emit('thresholdReached', currentThreshold);
            }
        }
        catch (error) {
            console.error('Error checking thresholds:', error);
        }
    }
    async resetCounter(isAutoReset = false) {
        try {
            this.swearCount = 0;
            if (this.currentSessionId) {
                await this.database.updateSession(this.currentSessionId, {
                    active: false,
                    end_time: new Date().toISOString()
                });
            }
            this.currentSessionId = await this.database.createSession();
            this.io.emit('countUpdate', this.swearCount);
            if (!isAutoReset) {
                console.log('Counter reset manually');
            }
        }
        catch (error) {
            console.error('Error resetting counter:', error);
            throw error;
        }
    }
    async start(port = 3000) {
        this.server.listen(port, () => {
            console.log(`Swear Jar server running on http://localhost:${port}`);
            console.log(`Browser Source URL: http://localhost:${port}/overlay.html`);
            console.log(`Control Panel: http://localhost:${port}/control.html`);
        });
    }
    async shutdown() {
        console.log('Shutting down SinBin service...');
        this.stopSpeechRecognition();
        await this.chatMonitor.disconnect();
        if (this.autoResetTimer) {
            clearTimeout(this.autoResetTimer);
        }
        if (this.currentSessionId) {
            await this.database.updateSession(this.currentSessionId, {
                active: false,
                end_time: new Date().toISOString()
            });
        }
        await this.database.close();
        console.log('SinBin service shut down complete');
    }
}
const swearJar = new SwearJarService();
swearJar.start();
//# sourceMappingURL=server.js.map