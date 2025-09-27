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

interface SwearJarConfig {
    predefinedCurseWords: string[]
    customCurseWords: string[]
    swearCount: number
}

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

    private config: SwearJarConfig = {
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
    }

    constructor() {
        this.setupExpress()
        this.setupWebSocket()
        this.loadConfig()
        this.testGoogleCloudConnection()
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

        // Root redirect
        this.app.get('/', (req, res) => {
            res.redirect('/control.html')
        })

        // API endpoints
        this.app.get('/api/count', (req, res) => {
            res.json({ count: this.swearCount })
        })

        this.app.post('/api/reset', (req, res) => {
            this.swearCount = 0
            this.saveConfig()
            this.io.emit('countUpdate', this.swearCount)
            res.json({ success: true, count: this.swearCount })
        })

        this.app.post('/api/add-word', (req, res) => {
            const { word } = req.body
            if (
                word &&
                !this.config.customCurseWords.includes(word.toLowerCase())
            ) {
                this.config.customCurseWords.push(word.toLowerCase())
                this.saveConfig()
                res.json({
                    success: true,
                    customWords: this.config.customCurseWords,
                })
            } else {
                res.status(400).json({
                    error: 'Word already exists or is invalid',
                })
            }
        })

        this.app.delete('/api/remove-word/:word', (req, res) => {
            const word = req.params.word.toLowerCase()
            this.config.customCurseWords = this.config.customCurseWords.filter(
                (w) => w !== word
            )
            this.saveConfig()
            res.json({
                success: true,
                customWords: this.config.customCurseWords,
            })
        })

        this.app.get('/api/words', (req, res) => {
            res.json({
                predefined: this.config.predefinedCurseWords,
                custom: this.config.customCurseWords,
            })
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

    private checkForCurseWords(transcript: string, isFinal: boolean = false) {
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
            this.swearCount += foundCurses
            this.saveConfig()
            this.io.emit('countUpdate', this.swearCount)

            const wordList = foundWords.join(', ')
            const finalStatus = isFinal ? 'final' : 'interim'
            console.log(`Detected ${foundCurses} profanity word${foundCurses > 1 ? 's' : ''}: ${wordList} | Total: ${this.swearCount} | Status: ${finalStatus}`)
        }
    }

    private loadConfig() {
        try {
            if (fs.existsSync('swear-jar-config.json')) {
                const configData = fs.readFileSync(
                    'swear-jar-config.json',
                    'utf8'
                )
                const savedConfig = JSON.parse(configData)
                this.config = { ...this.config, ...savedConfig }
                this.swearCount = this.config.swearCount
                console.log(
                    `Loaded config. Current swear count: ${this.swearCount}`
                )
            }
        } catch (error) {
            console.error('Error loading config:', error)
        }
    }

    private saveConfig() {
        try {
            this.config.swearCount = this.swearCount
            fs.writeFileSync(
                'swear-jar-config.json',
                JSON.stringify(this.config, null, 2)
            )
        } catch (error) {
            console.error('Error saving config:', error)
        }
    }

    public start(port: number = 3000) {
        this.server.listen(port, () => {
            console.log(`Swear Jar server running on http://localhost:${port}`)
            console.log(
                `Browser Source URL: http://localhost:${port}/overlay.html`
            )
            console.log(`Control Panel: http://localhost:${port}/control.html`)
        })
    }
}

// Start the server
const swearJar = new SwearJarService()
swearJar.start()
