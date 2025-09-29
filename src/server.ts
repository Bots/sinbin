import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import speech from '@google-cloud/speech'
const { v1p1beta1 } = speech
// @ts-ignore
const { record } = require('node-record-lpcm16')
import path from 'path'
import fs from 'fs'

// Database and enhanced types
import { Database } from './database/database'
import { SwearJarConfig } from './types/enhanced-types'
import { ChatMonitor } from './services/chat-monitor'
import multer from 'multer'

class SwearJarService {
    private app = express()
    private server = createServer(this.app)
    private io = new SocketIOServer(this.server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    })

    private speechClient = new v1p1beta1.SpeechClient()
    private swearCount = 0
    private isListening = false
    private recentTranscripts = new Set<string>()

    // Database
    private database: Database

    // Chat monitoring
    private chatMonitor: ChatMonitor

    // Current session
    private currentSessionId: number | null = null

    // Auto-reset timer
    private autoResetTimer: NodeJS.Timeout | null = null
    private lastPenaltyTime = 0

    // Infinite streaming properties
    private currentRecognizeStream: any = null
    private currentRecording: any = null
    private streamingLimit = 290000 // 4 minutes 50 seconds (just under 5 min limit)
    private restartCounter = 0
    private audioInput: Buffer[] = []
    private lastAudioInput: Buffer[] = []
    private resultEndTime = 0
    private isFinalEndTime = 0
    private finalRequestEndTime = 0
    private newStream = true
    private bridgingOffset = 0
    private lastTranscriptWasFinal = false
    private streamStartTime = 0

    // Legacy config for backward compatibility during migration
    private config: SwearJarConfig = {
        predefinedCurseWords: [
            'fuck', 'shit', 'damn', 'hell', 'bitch', 'ass', 'asshole', 'bastard',
            'crap', 'piss', 'cock', 'dick', 'pussy', 'tits', 'goddamn',
            'motherfucker', 'bullshit', 'dammit', 'fuckin', 'fucking',
            'shitty', 'bitchy', 'dickhead', 'douchebag'
        ],
        customCurseWords: [],
        swearCount: 0
    }

    constructor() {
        this.database = new Database()
        this.chatMonitor = new ChatMonitor(this.database)
        this.setupExpress()
        this.setupWebSocket()
        this.initializeDatabase()
        this.testGoogleCloudConnection()
    }

    private async initializeDatabase() {
        try {
            await this.database.initialize()
            
            // Check if we need to migrate from JSON config
            const legacyConfigExists = fs.existsSync('swear-jar-config.json')
            if (legacyConfigExists) {
                console.log('Found legacy JSON config, migrating to database...')
                this.loadLegacyConfig()
                await this.database.migrateFromJSON(this.config)
                
                // Backup the old config and remove it
                fs.renameSync('swear-jar-config.json', 'swear-jar-config.json.backup')
                console.log('Legacy config backed up as swear-jar-config.json.backup')
            }

            // Load current penalty count from database
            await this.loadCurrentCount()

            // Start or resume session
            await this.startSession()

            // Load custom words from database
            await this.loadCustomWords()

            // Start auto-reset timer if enabled
            await this.startAutoResetTimer()

            // Initialize chat monitor if enabled
            await this.initializeChatMonitor()

            console.log('Database initialization completed')
        } catch (error) {
            console.error('Database initialization failed:', error)
            throw error
        }
    }

    private async loadCurrentCount() {
        try {
            const session = await this.database.getActiveSession()
            if (session) {
                this.swearCount = session.total_penalties
                this.currentSessionId = session.id ?? null
            } else {
                this.swearCount = 0
            }
        } catch (error) {
            console.error('Error loading current count:', error)
            this.swearCount = 0
        }
    }

    private async loadCustomWords() {
        try {
            const customWordsJson = await this.database.getSetting('custom_curse_words')
            if (customWordsJson) {
                this.config.customCurseWords = JSON.parse(customWordsJson)
            }
        } catch (error) {
            console.error('Error loading custom words:', error)
            this.config.customCurseWords = []
        }
    }

    private async startSession() {
        try {
            const activeSession = await this.database.getActiveSession()
            if (!activeSession) {
                this.currentSessionId = await this.database.createSession()
                console.log(`Started new session: ${this.currentSessionId}`)
            } else {
                this.currentSessionId = activeSession.id ?? null
                console.log(`Resumed session: ${this.currentSessionId}`)
            }
        } catch (error) {
            console.error('Error starting session:', error)
        }
    }

    private async startAutoResetTimer() {
        try {
            const enabled = await this.database.getSetting('auto_reset_enabled')
            const duration = await this.database.getSetting('auto_reset_duration')
            
            if (enabled === 'true' && duration) {
                const durationMs = parseInt(duration) * 60 * 1000
                this.scheduleAutoReset(durationMs)
                console.log(`Auto-reset enabled: ${duration} minutes`)
            }
        } catch (error) {
            console.error('Error starting auto-reset timer:', error)
        }
    }

    private scheduleAutoReset(durationMs: number) {
        if (this.autoResetTimer) {
            clearTimeout(this.autoResetTimer)
        }

        this.autoResetTimer = setTimeout(async () => {
            const timeSinceLastPenalty = Date.now() - this.lastPenaltyTime
            if (timeSinceLastPenalty >= durationMs) {
                await this.resetCounter(true)
                this.io.emit('autoResetTriggered', { resetTime: Date.now() })
                console.log('Auto-reset triggered after clean period')
            }

            // Reschedule
            this.scheduleAutoReset(durationMs)
        }, durationMs)
    }

    private async initializeChatMonitor() {
        try {
            const chatEnabled = await this.database.getSetting('chat_enabled')
            if (chatEnabled === 'true') {
                const channel = await this.database.getSetting('chat_channel')
                const username = await this.database.getSetting('chat_username')
                const oauth = await this.database.getSetting('chat_oauth')

                if (channel) {
                    await this.chatMonitor.initialize(channel, username || undefined, oauth || undefined)
                    await this.chatMonitor.updateSessionId(this.currentSessionId!)
                    console.log(`Chat monitoring enabled for channel: ${channel}`)
                } else {
                    console.log('Chat enabled but no channel specified')
                }
            } else {
                console.log('Chat monitoring disabled')
            }
        } catch (error) {
            console.error('Error initializing chat monitor:', error)
        }
    }

    private loadLegacyConfig() {
        try {
            if (fs.existsSync('swear-jar-config.json')) {
                const configData = fs.readFileSync('swear-jar-config.json', 'utf8')
                const savedConfig = JSON.parse(configData)
                this.config = { ...this.config, ...savedConfig }
                console.log(`Loaded legacy config. Swear count: ${this.config.swearCount}`)
            }
        } catch (error) {
            console.error('Error loading legacy config:', error)
        }
    }

    private async testGoogleCloudConnection() {
        try {
            console.log('Testing Google Cloud Speech-to-Text connection...')

            // Verify credentials and API access with a simple initialization
            const client = new speech.SpeechClient()
            await client.initialize()

            console.log('Google Cloud connection established successfully')
        } catch (error: any) {
            console.error('Google Cloud connection test failed:', error.message)
            
            if (error.message.includes('billing')) {
                console.error('BILLING ISSUE: Please enable billing in Google Cloud Console')
                console.error('Speech-to-Text requires active billing to work beyond initial quota')
            }
            if (error.message.includes('quota')) {
                console.error('QUOTA EXCEEDED: Check your API quotas in Google Cloud Console')
            }
            if (error.message.includes('credentials')) {
                console.error('CREDENTIALS: Verify GOOGLE_APPLICATION_CREDENTIALS environment variable')
            }
            console.warn('Speech recognition may not function properly without valid credentials')
        }
    }

    private setupExpress() {
        this.app.use(express.json())
        this.app.use(express.static('public'))

        // Ensure sounds directory exists
        const soundsDir = path.join(process.cwd(), 'public', 'sounds')
        if (!fs.existsSync(soundsDir)) {
            fs.mkdirSync(soundsDir, { recursive: true })
        }

        // Serve sound files
        this.app.use('/sounds', express.static(soundsDir))

        // Configure multer for file uploads
        const storage = multer.diskStorage({
            destination: function (req, file, cb) {
                cb(null, soundsDir)
            },
            filename: function (req, file, cb) {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
                const extension = path.extname(file.originalname)
                cb(null, file.fieldname + '-' + uniqueSuffix + extension)
            }
        })

        const upload = multer({
            storage: storage,
            limits: {
                fileSize: 5 * 1024 * 1024 // 5MB limit
            },
            fileFilter: function (req, file, cb) {
                // Accept only audio files
                if (file.mimetype.startsWith('audio/')) {
                    cb(null, true)
                } else {
                    cb(new Error('Only audio files are allowed'))
                }
            }
        })

        // Root redirect
        this.app.get('/', (req, res) => {
            res.redirect('/control.html')
        })

        // API endpoints
        this.app.get('/api/count', (req, res) => {
            res.json({ count: this.swearCount })
        })

        this.app.post('/api/reset', async (req, res) => {
            try {
                await this.resetCounter()
                res.json({ success: true, count: this.swearCount })
            } catch (error) {
                console.error('Error resetting counter:', error)
                res.status(500).json({ error: 'Failed to reset counter' })
            }
        })

        this.app.post('/api/add-word', async (req, res) => {
            const { word } = req.body
            if (word && !this.config.customCurseWords.includes(word.toLowerCase())) {
                try {
                    this.config.customCurseWords.push(word.toLowerCase())
                    await this.database.setSetting('custom_curse_words', JSON.stringify(this.config.customCurseWords))
                    res.json({
                        success: true,
                        customWords: this.config.customCurseWords,
                    })
                } catch (error) {
                    console.error('Error adding word:', error)
                    res.status(500).json({ error: 'Failed to add word' })
                }
            } else {
                res.status(400).json({
                    error: 'Word already exists or is invalid',
                })
            }
        })

        this.app.delete('/api/remove-word/:word', async (req, res) => {
            const word = req.params.word.toLowerCase()
            try {
                this.config.customCurseWords = this.config.customCurseWords.filter(
                    (w) => w !== word
                )
                await this.database.setSetting('custom_curse_words', JSON.stringify(this.config.customCurseWords))
                res.json({
                    success: true,
                    customWords: this.config.customCurseWords,
                })
            } catch (error) {
                console.error('Error removing word:', error)
                res.status(500).json({ error: 'Failed to remove word' })
            }
        })

        this.app.get('/api/words', (req, res) => {
            res.json({
                predefined: this.config.predefinedCurseWords,
                custom: this.config.customCurseWords,
            })
        })

        this.app.get('/api/stats', async (req, res) => {
            try {
                const micCount = await this.database.getPenaltyCount('mic')
                const chatCount = await this.database.getPenaltyCount('chat')
                const session = await this.database.getActiveSession()
                const topUsers = await this.database.getTopUsers(10)
                const thresholds = await this.database.getThresholds()

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
                })
            } catch (error) {
                console.error('Error getting stats:', error)
                res.status(500).json({ error: 'Failed to get stats' })
            }
        })

        this.app.post('/api/sound-settings', (req, res) => {
            const { enabled, volume } = req.body
            this.io.emit('soundSettings', { enabled, volume })
            res.json({ success: true })
        })

        this.app.post('/api/test-sound', (req, res) => {
            this.io.emit('testSound')
            res.json({ success: true })
        })

        // New endpoints for enhanced features
        this.app.get('/api/thresholds', async (req, res) => {
            try {
                const thresholds = await this.database.getThresholds()
                res.json({ success: true, data: thresholds })
            } catch (error) {
                console.error('Error getting thresholds:', error)
                res.status(500).json({ error: 'Failed to get thresholds' })
            }
        })

        this.app.post('/api/settings', async (req, res) => {
            try {
                const { key, value } = req.body
                await this.database.setSetting(key, value)
                
                // Handle special settings that need immediate action
                if (key === 'auto_reset_enabled' || key === 'auto_reset_duration') {
                    await this.startAutoResetTimer()
                }
                
                res.json({ success: true })
            } catch (error) {
                console.error('Error saving setting:', error)
                res.status(500).json({ error: 'Failed to save setting' })
            }
        })

        this.app.get('/api/settings/:key', async (req, res) => {
            try {
                const value = await this.database.getSetting(req.params.key)
                res.json({ success: true, data: value })
            } catch (error) {
                console.error('Error getting setting:', error)
                res.status(500).json({ error: 'Failed to get setting' })
            }
        })

        // Chat monitoring endpoints
        this.app.post('/api/chat/connect', async (req, res) => {
            try {
                const { channel, username, oauth } = req.body

                // Save settings
                await this.database.setSetting('chat_enabled', 'true')
                await this.database.setSetting('chat_channel', channel)
                if (username) await this.database.setSetting('chat_username', username)
                if (oauth) await this.database.setSetting('chat_oauth', oauth)

                // Initialize chat monitor
                await this.chatMonitor.initialize(channel, username, oauth)
                await this.chatMonitor.updateSessionId(this.currentSessionId!)

                res.json({ success: true, message: 'Chat monitoring started' })
            } catch (error) {
                console.error('Error connecting to chat:', error)
                res.status(500).json({ error: 'Failed to connect to chat' })
            }
        })

        this.app.post('/api/chat/disconnect', async (req, res) => {
            try {
                await this.chatMonitor.disconnect()
                await this.database.setSetting('chat_enabled', 'false')
                res.json({ success: true, message: 'Chat monitoring stopped' })
            } catch (error) {
                console.error('Error disconnecting from chat:', error)
                res.status(500).json({ error: 'Failed to disconnect from chat' })
            }
        })

        this.app.get('/api/chat/status', (req, res) => {
            const status = this.chatMonitor.getConnectionStatus()
            res.json({ success: true, data: status })
        })

        this.app.get('/api/chat/stats', async (req, res) => {
            try {
                const stats = await this.chatMonitor.getChatStats()
                res.json({ success: true, data: stats })
            } catch (error) {
                console.error('Error getting chat stats:', error)
                res.status(500).json({ error: 'Failed to get chat stats' })
            }
        })

        this.app.get('/api/users', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit as string) || 10
                const users = await this.database.getTopUsers(limit)
                res.json({ success: true, data: users })
            } catch (error) {
                console.error('Error getting users:', error)
                res.status(500).json({ error: 'Failed to get users' })
            }
        })

        // Sound upload and management endpoints
        this.app.post('/api/sounds/upload', upload.single('soundFile'), async (req, res) => {
            try {
                if (!req.file) {
                    res.status(400).json({ error: 'No file uploaded' })
                    return
                }

                const { category = 'penalty', description = '' } = req.body

                // Save sound file info to database
                const soundData = {
                    filename: req.file.filename,
                    originalName: req.file.originalname,
                    category: category,
                    description: description,
                    fileSize: req.file.size,
                    uploadDate: new Date().toISOString(),
                    url: `/sounds/${req.file.filename}`
                }

                // Store in database as JSON setting
                const existingSounds = await this.database.getSetting('custom_sounds') || '[]'
                const sounds = JSON.parse(existingSounds)
                sounds.push(soundData)
                await this.database.setSetting('custom_sounds', JSON.stringify(sounds))

                res.json({
                    success: true,
                    data: soundData
                })
                return
            } catch (error) {
                console.error('Error uploading sound:', error)
                res.status(500).json({ error: 'Failed to upload sound file' })
                return
            }
        })

        this.app.get('/api/sounds', async (req, res) => {
            try {
                const soundsJson = await this.database.getSetting('custom_sounds') || '[]'
                const sounds = JSON.parse(soundsJson)
                res.json({ success: true, data: sounds })
            } catch (error) {
                console.error('Error getting sounds:', error)
                res.status(500).json({ error: 'Failed to get sounds' })
            }
        })

        this.app.delete('/api/sounds/:filename', async (req, res) => {
            try {
                const filename = req.params.filename
                const soundsDir = path.join(process.cwd(), 'public', 'sounds')
                const filePath = path.join(soundsDir, filename)

                // Remove from database
                const existingSounds = await this.database.getSetting('custom_sounds') || '[]'
                const sounds = JSON.parse(existingSounds)
                const updatedSounds = sounds.filter((sound: any) => sound.filename !== filename)
                await this.database.setSetting('custom_sounds', JSON.stringify(updatedSounds))

                // Remove physical file
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath)
                }

                res.json({ success: true, message: 'Sound file deleted' })
            } catch (error) {
                console.error('Error deleting sound:', error)
                res.status(500).json({ error: 'Failed to delete sound file' })
            }
        })

        this.app.post('/api/sounds/play', (req, res) => {
            const { filename, volume = 0.5 } = req.body

            // Emit sound play event to connected clients
            this.io.emit('soundPlay', {
                file: `/sounds/${filename}`,
                volume: volume
            })

            res.json({ success: true, message: 'Sound play triggered' })
        })

        // Additional endpoints for the modern control panel
        this.app.post('/api/thresholds', async (req, res) => {
            try {
                const { warning, danger } = req.body
                if (warning) {
                    await this.database.setSetting('warning_threshold', warning.count.toString())
                    await this.database.setSetting('warning_color', warning.color)
                }
                if (danger) {
                    await this.database.setSetting('danger_threshold', danger.count.toString())
                    await this.database.setSetting('danger_color', danger.color)
                }
                res.json({ success: true })
            } catch (error) {
                console.error('Error saving thresholds:', error)
                res.status(500).json({ error: 'Failed to save thresholds' })
            }
        })

        this.app.post('/api/auto-reset', async (req, res) => {
            try {
                const { enabled, duration } = req.body
                await this.database.setSetting('auto_reset_enabled', enabled.toString())
                await this.database.setSetting('auto_reset_duration', duration.toString())
                res.json({ success: true })
            } catch (error) {
                console.error('Error saving auto-reset settings:', error)
                res.status(500).json({ error: 'Failed to save auto-reset settings' })
            }
        })

        this.app.post('/api/reset-session', async (req, res) => {
            try {
                const activeSession = await this.database.getActiveSession()
                if (activeSession && activeSession.id) {
                    await this.database.updateSession(activeSession.id, {
                        active: false,
                        end_time: new Date().toISOString()
                    })
                }
                // Create new session
                await this.database.createSession()
                res.json({ success: true })
            } catch (error) {
                console.error('Error resetting session:', error)
                res.status(500).json({ error: 'Failed to reset session' })
            }
        })

        this.app.get('/api/export', async (req, res) => {
            try {
                const activeSession = await this.database.getActiveSession()
                const penalties = await this.database.getPenalties(1000) // Get last 1000 penalties
                const users = await this.database.getTopUsers(50)

                const exportData = {
                    session: activeSession,
                    penalties,
                    users,
                    exportedAt: new Date().toISOString()
                }

                res.json(exportData)
            } catch (error) {
                console.error('Error exporting data:', error)
                res.status(500).json({ error: 'Failed to export data' })
            }
        })

        this.app.post('/api/reset-all', async (req, res) => {
            try {
                // This would require database methods to clear all data
                // For now, just reset the counter
                this.swearCount = 0
                this.io.emit('countUpdate', this.swearCount)
                res.json({ success: true })
            } catch (error) {
                console.error('Error resetting all data:', error)
                res.status(500).json({ error: 'Failed to reset all data' })
            }
        })
    }

    private setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log('Browser source connected')

            socket.emit('countUpdate', this.swearCount)

            socket.on('startListening', () => {
                if (!this.isListening) {
                    this.startSpeechRecognition()
                    // Notify clients that listening has started
                    this.io.emit('statusUpdate', 'listening')
                }
            })

            socket.on('stopListening', () => {
                this.stopSpeechRecognition()
                // Notify clients that listening has stopped
                this.io.emit('statusUpdate', 'connected')
            })

            socket.on('themeUpdate', (theme) => {
                // Broadcast theme update to all connected clients
                this.io.emit('themeUpdate', theme)
                console.log(`Theme updated: ${theme.primaryColor} → ${theme.secondaryColor}`)
            })

            socket.on('displayOptionsUpdate', (options) => {
                // Broadcast display options to all connected clients
                this.io.emit('displayOptionsUpdate', options)
                console.log('Display options updated:', options)
            })

            socket.on('disconnect', () => {
                console.log('Browser source disconnected')
            })
        })
    }

    private async startSpeechRecognition() {
        if (this.isListening) return

        console.log('Starting continuous speech recognition...')
        this.isListening = true
        this.restartCounter = 0
        
        // Reset all streaming state
        this.audioInput = []
        this.lastAudioInput = []
        this.resultEndTime = 0
        this.isFinalEndTime = 0
        this.finalRequestEndTime = 0
        this.newStream = true
        this.bridgingOffset = 0
        this.lastTranscriptWasFinal = false

        this.startStream()
    }

    private startStream() {
        // Clear audio buffer for new stream
        this.audioInput = []
        this.streamStartTime = Date.now()

        const config = {
            encoding: 'LINEAR16' as const,
            sampleRateHertz: 16000,
            languageCode: 'en-US',
            enableAutomaticPunctuation: false,
            model: 'latest_long',
            enableWordTimeOffsets: false,
            enableWordConfidence: true,
            maxAlternatives: 1,
        }

        const request = {
            config,
            interimResults: true,
            singleUtterance: false,
        }

        console.log(`Creating speech recognition stream ${this.restartCounter + 1}`)

        // Initialize streaming recognition with error handling
        this.currentRecognizeStream = this.speechClient
            .streamingRecognize(request)
            .on('error', (err: any) => {
                console.error('Speech recognition stream error:', err.message)
                
                if (err.code === 11) {
                    // Resource exhausted - restart stream automatically
                    this.restartStream()
                } else if (err.message.includes('credentials') || 
                          err.message.includes('Could not load the default credentials')) {
                    console.error('Authentication failed - check GOOGLE_APPLICATION_CREDENTIALS')
                    console.log('Stopping speech recognition due to credential issues')
                    this.isListening = false
                    return
                } else {
                    console.error('Unexpected API error:', err)
                    this.restartStream()
                }
            })
            .on('data', (stream: any) => this.speechCallback(stream))

        // Schedule automatic stream restart before hitting API limits
        setTimeout(() => {
            if (this.isListening && this.currentRecognizeStream) {
                console.log(`Stream limit approaching (${this.streamingLimit / 1000}s), restarting...`)
                this.restartStream()
            }
        }, this.streamingLimit)

        // Start audio recording if not already active
        if (!this.currentRecording) {
            this.startRecording()
        }
    }

    private speechCallback(stream: any) {
        // Validate response structure
        if (!stream.results?.[0]?.alternatives?.[0]) {
            return
        }

        // Convert API result timing from seconds + nanoseconds to milliseconds
        this.resultEndTime =
            stream.results[0].resultEndTime.seconds * 1000 +
            Math.round(stream.results[0].resultEndTime.nanos / 1000000)

        // Calculate corrected time accounting for bridging and restarts
        const correctedTime =
            this.resultEndTime -
            this.bridgingOffset +
            this.streamingLimit * this.restartCounter

        const transcript = stream.results[0].alternatives[0].transcript
            .toLowerCase()
            .trim()
        const confidence = stream.results[0].alternatives[0].confidence || 0
        const streamAge = Date.now() - this.streamStartTime

        if (stream.results[0].isFinal) {
            console.log(`Final transcript (${Math.round(streamAge / 1000)}s): "${transcript}" (confidence: ${confidence.toFixed(2)})`)

            this.isFinalEndTime = this.resultEndTime
            this.lastTranscriptWasFinal = true

            // Process final transcript for profanity detection
            if (transcript) {
                this.checkForCurseWords(transcript, true)
                
                // Send final transcript to overlay for display
                this.io.emit('transcriptUpdate', transcript)
            }
        } else {
            // Process interim results for responsive detection and display
            if (transcript && confidence > 0.3) {
                this.checkForCurseWords(transcript, false)
                
                // Send interim transcript for live display
                this.io.emit('transcriptUpdate', transcript)
            }
            this.lastTranscriptWasFinal = false
        }
    }

    private restartStream() {
        // Clean up current stream
        if (this.currentRecognizeStream) {
            this.currentRecognizeStream.end()
            this.currentRecognizeStream.removeListener('data', this.speechCallback)
            this.currentRecognizeStream = null
        }

        // Update timing state for seamless transition
        if (this.resultEndTime > 0) {
            this.finalRequestEndTime = this.isFinalEndTime
        }
        this.resultEndTime = 0

        // Preserve audio for bridging
        this.lastAudioInput = []
        this.lastAudioInput = [...this.audioInput]

        this.restartCounter++

        if (!this.lastTranscriptWasFinal) {
            console.log('Mid-sentence stream restart detected')
        }
        
        console.log(`Restarting speech recognition stream ${this.restartCounter} (${(this.streamingLimit * this.restartCounter) / 1000}s total)`)

        this.newStream = true

        // Continue listening if still active
        if (this.isListening) {
            this.startStream()
        }
    }

    private startRecording() {
        try {
            // Clean up any existing recording
            if (this.currentRecording) {
                if (this.currentRecording.stop) {
                    this.currentRecording.stop()
                }
                this.currentRecording = null
            }

            // Select appropriate recording program based on platform
            let recordProgram = 'rec'
            if (process.platform === 'linux') {
                recordProgram = 'arecord'
            }

            console.log(`Initializing audio recording with ${recordProgram}`)

            this.currentRecording = record({
                sampleRateHertz: 16000,
                threshold: 0,
                silence: 1000,
                keepSilence: true,
                recordProgram: recordProgram,
            })

            if (!this.currentRecording || typeof this.currentRecording.stream !== 'function') {
                throw new Error('Audio recording initialization failed. Verify recording software is installed.')
            }

            const recordingStream = this.currentRecording.stream()

            recordingStream
                .on('error', (err: any) => {
                    console.error('Audio recording error:', err.message)
                    // Restart if still actively listening
                    if (this.isListening) {
                        this.restartStream()
                    }
                })
                .on('data', (chunk: Buffer) => {
                    // Handle seamless audio bridging between stream restarts
                    if (this.newStream && this.lastAudioInput.length !== 0) {
                        // Calculate bridging offset for smooth transitions
                        const chunkTime = this.streamingLimit / this.lastAudioInput.length
                        if (chunkTime !== 0) {
                            if (this.bridgingOffset < 0) {
                                this.bridgingOffset = 0
                            }
                            if (this.bridgingOffset > this.finalRequestEndTime) {
                                this.bridgingOffset = this.finalRequestEndTime
                            }
                            
                            const chunksFromMS = Math.floor(
                                (this.finalRequestEndTime - this.bridgingOffset) / chunkTime
                            )
                            this.bridgingOffset = Math.floor(
                                (this.lastAudioInput.length - chunksFromMS) * chunkTime
                            )

                            // Send bridging audio from previous stream
                            for (let i = chunksFromMS; i < this.lastAudioInput.length; i++) {
                                if (this.currentRecognizeStream) {
                                    this.currentRecognizeStream.write(this.lastAudioInput[i])
                                }
                            }
                        }
                        this.newStream = false
                    }

                    // Store audio data for potential future bridging
                    this.audioInput.push(chunk)

                    // Send current audio to active recognition stream
                    if (this.currentRecognizeStream) {
                        this.currentRecognizeStream.write(chunk)
                    }
                })

            console.log('Audio recording started successfully')
        } catch (error: any) {
            console.error('Failed to start audio recording:', error.message)
            throw error
        }
    }

    private stopSpeechRecognition() {
        console.log('Stopping speech recognition...')
        this.isListening = false

        // Clear any active stream timeout
        if (this.streamingLimit) {
            clearTimeout(this.streamingLimit)
        }

        // Clean up recognition stream
        if (this.currentRecognizeStream) {
            try {
                this.currentRecognizeStream.removeAllListeners()
                this.currentRecognizeStream.destroy()
            } catch (err) {
                // Ignore cleanup errors during shutdown
            }
            this.currentRecognizeStream = null
        }

        // Clean up audio recording
        if (this.currentRecording) {
            try {
                if (this.currentRecording.stop) {
                    this.currentRecording.stop()
                }
            } catch (err) {
                // Ignore cleanup errors during shutdown
            }
            this.currentRecording = null
        }

        // Reset all audio buffers and timing state
        this.audioInput = []
        this.lastAudioInput = []
        this.bridgingOffset = 0
        this.finalRequestEndTime = 0
    }

    private async checkForCurseWords(transcript: string, isFinal: boolean = false) {
        const allCurseWords = [
            ...this.config.predefinedCurseWords,
            ...this.config.customCurseWords,
        ]
        const words = transcript.split(/\s+/)

        let foundCurses = 0
        const foundWords: string[] = []

        words.forEach((word) => {
            const cleanWord = word.replace(/[^\w]/g, '').toLowerCase()

            if (cleanWord && allCurseWords.includes(cleanWord)) {
                // Use timestamp-based deduplication to prevent counting the same word multiple times
                const wordId = `${cleanWord}_${Math.floor(Date.now() / 1000)}`

                if (!this.recentTranscripts.has(wordId)) {
                    foundCurses++
                    foundWords.push(cleanWord)
                    this.recentTranscripts.add(wordId)

                    // Remove from recent list after 2 seconds
                    setTimeout(() => {
                        this.recentTranscripts.delete(wordId)
                    }, 2000)
                }
            }
        })

        if (foundCurses > 0) {
            await this.addPenalties(foundWords, 'mic')

            const wordList = foundWords.join(', ')
            const finalStatus = isFinal ? 'final' : 'interim'
            console.log(`Detected ${foundCurses} profanity word${foundCurses > 1 ? 's' : ''}: ${wordList} | Total: ${this.swearCount} | Status: ${finalStatus}`)
        }
    }

    private async addPenalties(words: string[], source: 'mic' | 'chat', username?: string) {
        try {
            for (const word of words) {
                // Add to database
                await this.database.addPenalty({
                    word,
                    source,
                    username,
                    ...(this.currentSessionId !== null ? { session_id: this.currentSessionId } : {})
                })

                this.swearCount++
                this.lastPenaltyTime = Date.now()

                // Emit penalty event with animation trigger
                this.io.emit('penaltyDetected', {
                    word,
                    source,
                    username,
                    timestamp: Date.now(),
                    sessionId: this.currentSessionId
                })

                // Trigger bin animation
                this.io.emit('animationTrigger', {
                    type: 'binShake',
                    data: { word, intensity: 5 }
                })
            }

            // Auto-play penalty sound if sounds are available
            await this.playPenaltySound()

            // Update session stats
            if (this.currentSessionId) {
                const session = await this.database.getActiveSession()
                if (session) {
                    await this.database.updateSession(this.currentSessionId, {
                        total_penalties: session.total_penalties + words.length,
                        mic_penalties: source === 'mic' ? session.mic_penalties + words.length : session.mic_penalties,
                        chat_penalties: source === 'chat' ? session.chat_penalties + words.length : session.chat_penalties
                    })
                }
            }

            // Check thresholds
            await this.checkThresholds()

            // Emit count update
            this.io.emit('countUpdate', this.swearCount)

        } catch (error) {
            console.error('Error adding penalties:', error)
        }
    }

    private async playPenaltySound() {
        try {
            // Get available penalty sounds from database
            const soundsJson = await this.database.getSetting('custom_sounds') || '[]'
            const sounds = JSON.parse(soundsJson)
            
            // Filter for penalty category sounds
            const penaltySounds = sounds.filter((sound: any) => 
                sound.category === 'penalty' || !sound.category
            )
            
            if (penaltySounds.length > 0) {
                // Randomly select a penalty sound
                const randomSound = penaltySounds[Math.floor(Math.random() * penaltySounds.length)]
                
                // Get sound settings (default to enabled with 50% volume)
                const soundEnabled = await this.database.getSetting('sound_enabled')
                const volume = parseFloat(await this.database.getSetting('sound_volume') || '0.5')
                
                // Default to enabled if setting doesn't exist
                if (soundEnabled !== 'false') {
                    // Emit sound play event to connected clients
                    this.io.emit('soundPlay', {
                        file: `/sounds/${randomSound.filename}`,
                        volume: volume
                    })
                    
                    console.log(`Playing penalty sound: ${randomSound.description || randomSound.filename} at volume ${Math.round(volume * 100)}%`)
                }
            } else {
                console.log('No penalty sounds available for playback')
            }
        } catch (error) {
            console.error('Error playing penalty sound:', error)
        }
    }

    private async checkThresholds() {
        try {
            const thresholds = await this.database.getThresholds()
            const currentThreshold = thresholds
                .filter(t => this.swearCount >= t.count)
                .sort((a, b) => b.count - a.count)[0]

            if (currentThreshold) {
                this.io.emit('thresholdReached', currentThreshold)
            }
        } catch (error) {
            console.error('Error checking thresholds:', error)
        }
    }

    private async resetCounter(isAutoReset: boolean = false) {
        try {
            this.swearCount = 0
            
            // End current session and start new one
            if (this.currentSessionId) {
                await this.database.updateSession(this.currentSessionId, {
                    active: false,
                    end_time: new Date().toISOString()
                })
            }

            // Start new session
            this.currentSessionId = await this.database.createSession()

            this.io.emit('countUpdate', this.swearCount)
            
            if (!isAutoReset) {
                console.log('Counter reset manually')
            }
        } catch (error) {
            console.error('Error resetting counter:', error)
            throw error
        }
    }

    public async start(port: number = 3000) {
        this.server.listen(port, () => {
            console.log(`Swear Jar server running on http://localhost:${port}`)
            console.log(`Browser Source URL: http://localhost:${port}/overlay.html`)
            console.log(`Control Panel: http://localhost:${port}/control.html`)
        })
    }

    public async shutdown() {
        console.log('Shutting down SinBin service...')

        // Stop speech recognition
        this.stopSpeechRecognition()

        // Disconnect chat monitor
        await this.chatMonitor.disconnect()

        // Clear timers
        if (this.autoResetTimer) {
            clearTimeout(this.autoResetTimer)
        }

        // End current session
        if (this.currentSessionId) {
            await this.database.updateSession(this.currentSessionId, {
                active: false,
                end_time: new Date().toISOString()
            })
        }

        // Close database
        await this.database.close()

        console.log('SinBin service shut down complete')
    }
}

// Start the server
const swearJar = new SwearJarService()
swearJar.start()
