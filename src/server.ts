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
            console.log('🧪 Testing Google Cloud Speech-to-Text connection...')

            // Simple test to verify credentials and API access
            const client = new speech.SpeechClient()

            // This will throw an error if credentials/billing are wrong
            await client.initialize()

            console.log('✅ Google Cloud connection successful')
        } catch (error: any) {
            console.error(
                '❌ Google Cloud connection test failed:',
                error.message
            )
            if (error.message.includes('billing')) {
                console.error(
                    '🚨 BILLING NOT ENABLED: Go to Google Cloud Console > Billing'
                )
                console.error(
                    '   Without billing, Speech-to-Text stops after first utterance!'
                )
            }
            if (error.message.includes('quota')) {
                console.error(
                    '🚨 QUOTA EXCEEDED: Check APIs & Services > Quotas in GCP'
                )
            }
            if (error.message.includes('credentials')) {
                console.error(
                    '🚨 CREDENTIALS: Check GOOGLE_APPLICATION_CREDENTIALS environment variable'
                )
            }
            console.error(
                '⚠️  Streaming speech recognition may not work properly'
            )
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
                }
            })

            socket.on('stopListening', () => {
                this.stopSpeechRecognition()
            })

            socket.on('themeUpdate', (theme) => {
                // Broadcast theme update to all connected clients
                this.io.emit('themeUpdate', theme)
                console.log(
                    `🎨 Theme updated: ${theme.primaryColor} → ${theme.secondaryColor}`
                )
            })

            socket.on('displayOptionsUpdate', (options) => {
                // Broadcast display options to all connected clients
                this.io.emit('displayOptionsUpdate', options)
                console.log('🎛️ Display options updated:', options)
            })

            socket.on('disconnect', () => {
                console.log('Browser source disconnected')
            })
        })
    }

    private async startSpeechRecognition() {
        if (this.isListening) return

        console.log('🎤 Starting infinite speech recognition...')
        this.isListening = true
        this.restartCounter = 0
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
        // Clear current audioInput
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

        console.log(
            `🟢 Creating infinite stream #${
                this.restartCounter + 1
            } at ${new Date().toLocaleTimeString()}`
        )

        // Initiate (Reinitiate) a recognize stream
        this.currentRecognizeStream = this.speechClient
            .streamingRecognize(request)
            .on('error', (err: any) => {
                console.error('❌ Speech stream error:', err.message)
                if (err.code === 11) {
                    // Resource exhausted - restart stream
                    this.restartStream()
                } else if (
                    err.message.includes('credentials') ||
                    err.message.includes(
                        'Could not load the default credentials'
                    )
                ) {
                    console.error(
                        '🚨 CREDENTIALS: Check GOOGLE_APPLICATION_CREDENTIALS environment variable'
                    )
                    console.log('⏸️ Stopping due to credential issues')
                    this.isListening = false
                    return
                } else {
                    console.error('API request error:', err)
                    this.restartStream()
                }
            })
            .on('data', (stream: any) => this.speechCallback(stream))

        // Restart stream when streamingLimit expires
        setTimeout(() => {
            if (this.isListening && this.currentRecognizeStream) {
                console.log(
                    `⏰ Stream limit reached (${
                        this.streamingLimit / 1000
                    }s), restarting...`
                )
                this.restartStream()
            }
        }, this.streamingLimit)

        // Start recording if not already started
        if (!this.currentRecording) {
            this.startRecording()
        }
    }

    private speechCallback(stream: any) {
        if (
            !stream.results ||
            !stream.results[0] ||
            !stream.results[0].alternatives ||
            !stream.results[0].alternatives[0]
        ) {
            return
        }

        // Convert API result end time from seconds + nanoseconds to milliseconds
        this.resultEndTime =
            stream.results[0].resultEndTime.seconds * 1000 +
            Math.round(stream.results[0].resultEndTime.nanos / 1000000)

        // Calculate correct time based on offset from audio sent twice
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
            console.log(
                `👂 [${Math.round(
                    streamAge / 1000
                )}s] "${transcript}" (conf: ${confidence.toFixed(
                    2
                )}, final: true)`
            )

            this.isFinalEndTime = this.resultEndTime
            this.lastTranscriptWasFinal = true

            // Process final transcript for curse words
            if (transcript) {
                this.checkForCurseWords(transcript, true)
                
                // Emit transcript update for ticker (only final transcripts)
                this.io.emit('transcriptUpdate', transcript)
            }
        } else {
            // Process interim results for better responsiveness
            if (transcript && confidence > 0.5) {
                this.checkForCurseWords(transcript, false)
            }
            this.lastTranscriptWasFinal = false
        }
    }

    private restartStream() {
        if (this.currentRecognizeStream) {
            this.currentRecognizeStream.end()
            this.currentRecognizeStream.removeListener(
                'data',
                this.speechCallback
            )
            this.currentRecognizeStream = null
        }

        if (this.resultEndTime > 0) {
            this.finalRequestEndTime = this.isFinalEndTime
        }
        this.resultEndTime = 0

        this.lastAudioInput = []
        this.lastAudioInput = [...this.audioInput]

        this.restartCounter++

        if (!this.lastTranscriptWasFinal) {
            console.log('🔄 Mid-sentence restart detected')
        }
        console.log(
            `🔄 Stream restart #${this.restartCounter} (${
                (this.streamingLimit * this.restartCounter) / 1000
            }s total)`
        )

        this.newStream = true

        // Only restart if still listening
        if (this.isListening) {
            this.startStream()
        }
    }

    private startRecording() {
        try {
            if (this.currentRecording) {
                if (this.currentRecording.stop) {
                    this.currentRecording.stop()
                }
                this.currentRecording = null
            }

            let recordProgram = 'rec'
            if (process.platform === 'linux') {
                recordProgram = 'arecord'
            }

            console.log(`Using recording program: ${recordProgram}`)

            this.currentRecording = record({
                sampleRateHertz: 16000,
                threshold: 0,
                silence: 1000,
                keepSilence: true,
                recordProgram: recordProgram,
            })

            if (
                !this.currentRecording ||
                typeof this.currentRecording.stream !== 'function'
            ) {
                throw new Error(
                    'Recording object is invalid. Make sure audio recording software is installed.'
                )
            }

            const recordingStream = this.currentRecording.stream()

            recordingStream
                .on('error', (err: any) => {
                    console.error('🎤 Recording stream error:', err.message)
                    // Only restart if we're still supposed to be listening
                    if (this.isListening) {
                        this.restartStream()
                    }
                })
                .on('data', (chunk: Buffer) => {
                    // Implement bridging logic for seamless transitions
                    if (this.newStream && this.lastAudioInput.length !== 0) {
                        // Approximate math to calculate time of chunks
                        const chunkTime =
                            this.streamingLimit / this.lastAudioInput.length
                        if (chunkTime !== 0) {
                            if (this.bridgingOffset < 0) {
                                this.bridgingOffset = 0
                            }
                            if (
                                this.bridgingOffset > this.finalRequestEndTime
                            ) {
                                this.bridgingOffset = this.finalRequestEndTime
                            }
                            const chunksFromMS = Math.floor(
                                (this.finalRequestEndTime -
                                    this.bridgingOffset) /
                                    chunkTime
                            )
                            this.bridgingOffset = Math.floor(
                                (this.lastAudioInput.length - chunksFromMS) *
                                    chunkTime
                            )

                            // Send bridging audio from previous stream
                            for (
                                let i = chunksFromMS;
                                i < this.lastAudioInput.length;
                                i++
                            ) {
                                if (this.currentRecognizeStream) {
                                    this.currentRecognizeStream.write(
                                        this.lastAudioInput[i]
                                    )
                                }
                            }
                        }
                        this.newStream = false
                    }

                    // Store audio data for potential bridging
                    this.audioInput.push(chunk)

                    // Send current audio to recognition stream
                    if (this.currentRecognizeStream) {
                        this.currentRecognizeStream.write(chunk)
                    }
                })

            console.log('🎙️ Audio recording started with infinite streaming')
        } catch (error: any) {
            console.error('❌ Failed to start recording:', error.message)
            throw error
        }
    }

    private stopSpeechRecognition() {
        console.log('🛑 Stopping speech recognition...')
        this.isListening = false

        // Clear stream timeout
        if (this.streamingLimit) {
            clearTimeout(this.streamingLimit)
        }

        if (this.currentRecognizeStream) {
            try {
                this.currentRecognizeStream.removeAllListeners()
                this.currentRecognizeStream.destroy()
            } catch (err) {
                // Ignore cleanup errors
            }
            this.currentRecognizeStream = null
        }

        if (this.currentRecording) {
            try {
                if (this.currentRecording.stop) {
                    this.currentRecording.stop()
                }
            } catch (err) {
                // Ignore cleanup errors
            }
            this.currentRecording = null
        }

        // Clear audio buffers
        this.audioInput = []
        this.lastAudioInput = []

        // Reset timing variables
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
                const wordId = `${cleanWord}_${Math.floor(Date.now() / 1000)}`

                if (!this.recentTranscripts.has(wordId)) {
                    foundCurses++
                    foundWords.push(cleanWord)
                    this.recentTranscripts.add(wordId)

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

            console.log(
                `🤬 Curse word${
                    foundCurses > 1 ? 's' : ''
                } detected: ${foundWords.join(', ')} | Total: ${
                    this.swearCount
                } | Final: ${isFinal}`
            )
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
