import express from 'express'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import speech from '@google-cloud/speech'
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

    private speechClient = new speech.SpeechClient()
    private swearCount = 0
    private isListening = false
    private recentTranscripts = new Set<string>()
    private currentRecognizeStream: any = null
    private currentRecording: any = null
    private restartTimeout: NodeJS.Timeout | null = null

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

            socket.on('disconnect', () => {
                console.log('Browser source disconnected')
            })
        })
    }

    private async startSpeechRecognition() {
        if (this.isListening) return

        console.log('🎤 Starting speech recognition...')
        this.isListening = true

        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout)
            this.restartTimeout = null
        }

        const request = {
            config: {
                encoding: 'LINEAR16' as const,
                sampleRateHertz: 16000,
                languageCode: 'en-US',
                enableAutomaticPunctuation: false,
                model: 'command_and_search', // Better for continuous listening
            },
            interimResults: true,
            singleUtterance: false,
        }

        try {
            if (this.currentRecognizeStream) {
                this.currentRecognizeStream.removeAllListeners()
                this.currentRecognizeStream.end()
                this.currentRecognizeStream = null
            }

            const streamStartTime = Date.now()
            console.log(
                `🟢 Creating new recognition stream at ${new Date().toLocaleTimeString()}`
            )

            this.currentRecognizeStream = this.speechClient
                .streamingRecognize(request)
                .on('error', (err: any) => {
                    console.error(
                        `❌ Speech error after ${
                            Date.now() - streamStartTime
                        }ms:`,
                        err.message
                    )
                    if (
                        err.message.includes('billing') ||
                        err.message.includes('quota')
                    ) {
                        console.error(
                            '🚨 BILLING/QUOTA ISSUE: Enable billing in Google Cloud Console!'
                        )
                    }
                    this.restartRecognition(2000)
                })
                .on('data', (data: any) => {
                    if (data.results[0] && data.results[0].alternatives[0]) {
                        const transcript =
                            data.results[0].alternatives[0].transcript
                                .toLowerCase()
                                .trim()
                        const confidence =
                            data.results[0].alternatives[0].confidence || 0
                        const streamAge = Date.now() - streamStartTime

                        console.log(
                            `👂 [${Math.round(
                                streamAge / 1000
                            )}s] "${transcript}" (conf: ${confidence.toFixed(
                                2
                            )}, final: ${data.results[0].isFinal})`
                        )

                        if (
                            transcript &&
                            (data.results[0].isFinal || confidence > 0.7)
                        ) {
                            this.checkForCurseWords(
                                transcript,
                                data.results[0].isFinal
                            )
                        }
                    } else {
                        console.log(
                            '📡 Received data but no transcript results'
                        )
                    }
                })
                .on('end', () => {
                    const streamDuration = Date.now() - streamStartTime
                    console.log(
                        `🔚 Stream ended after ${Math.round(
                            streamDuration / 1000
                        )}s - restarting`
                    )
                    this.restartRecognition(500)
                })
                .on('close', () => {
                    const streamDuration = Date.now() - streamStartTime
                    console.log(
                        `🔒 Stream closed after ${Math.round(
                            streamDuration / 1000
                        )}s`
                    )
                })

            this.startRecording()

            console.log('✅ Speech recognition active - AUTO-RESTART every 45s')
            this.schedulePeriodicRestart(45 * 1000)
        } catch (error: any) {
            console.error(
                '❌ Failed to start speech recognition:',
                error.message
            )
            this.restartRecognition(2000)
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
                threshold: 0.1,
                verbose: false,
                recordProgram: recordProgram,
                silence: '0.5',
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
                    this.restartRecognition(3000)
                })
                .pipe(this.currentRecognizeStream)

            console.log('🎙️ Audio recording started')
        } catch (error: any) {
            console.error('❌ Failed to start recording:', error.message)
            throw error
        }
    }

    private schedulePeriodicRestart(intervalMs: number = 45000) {
        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout)
            this.restartTimeout = null
        }

        this.restartTimeout = setTimeout(() => {
            console.log(
                `⏰ Scheduled restart after ${
                    intervalMs / 1000
                }s to prevent timeout...`
            )
            this.restartRecognition(300)
        }, intervalMs)
    }

    private restartRecognition(delay: number = 500) {
        console.log(`🔄 Restarting in ${delay}ms...`)

        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout)
            this.restartTimeout = null
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

        this.isListening = false

        setTimeout(() => {
            this.startSpeechRecognition()
        }, delay)
    }

    private stopSpeechRecognition() {
        console.log('🛑 Stopping speech recognition...')
        this.isListening = false

        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout)
            this.restartTimeout = null
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
