import tmi from 'tmi.js'
import { Database } from '../database/database'
import { ChatMessage, PenaltyEvent } from '../types/enhanced-types'

export class ChatMonitor {
    private client: tmi.Client | null = null
    private database: Database
    private customWords: string[] = []
    private predefinedWords: string[] = [
        'fuck', 'shit', 'damn', 'hell', 'bitch', 'ass', 'asshole', 'bastard',
        'crap', 'piss', 'cock', 'dick', 'pussy', 'tits', 'goddamn',
        'motherfucker', 'bullshit', 'dammit', 'fuckin', 'fucking',
        'shitty', 'bitchy', 'dickhead', 'douchebag'
    ]
    private isConnected = false
    private currentSessionId: number | null = null

    // Rate limiting to prevent spam detection
    private userCooldowns = new Map<string, number>()
    private readonly COOLDOWN_MS = 2000 // 2 seconds between penalties per user

    constructor(database: Database) {
        this.database = database
    }

    async initialize(channel: string, username?: string, oauth?: string): Promise<void> {
        try {
            // Load custom words from database
            await this.loadCustomWords()

            // Get active session
            const session = await this.database.getActiveSession()
            this.currentSessionId = session?.id || null

            // Configure TMI client
            const clientConfig: tmi.Options = {
                connection: {
                    secure: true,
                    reconnect: true,
                },
                channels: [channel]
            }

            // Add authentication if provided
            if (username && oauth) {
                clientConfig.identity = {
                    username: username,
                    password: oauth
                }
            }

            this.client = new tmi.Client(clientConfig)

            // Setup event handlers
            this.setupEventHandlers()

            // Connect to chat
            await this.client.connect()
            console.log(`Connected to Twitch chat: #${channel}`)
            this.isConnected = true

        } catch (error) {
            console.error('Failed to initialize chat monitor:', error)
            throw error
        }
    }

    private setupEventHandlers(): void {
        if (!this.client) return

        this.client.on('connected', (addr, port) => {
            console.log(`Chat monitor connected to ${addr}:${port}`)
            this.isConnected = true
        })

        this.client.on('disconnected', (reason) => {
            console.log(`Chat monitor disconnected: ${reason}`)
            this.isConnected = false
        })

        this.client.on('message', async (channel, userstate, message, self) => {
            // Don't monitor our own messages
            if (self) return

            const username = userstate.username || 'unknown'
            const displayName = userstate['display-name'] || username

            try {
                // Update user message count
                await this.database.addOrUpdateUser(username, 0)

                // Check for profanity
                const penalties = this.checkMessageForProfanity(message, username)

                if (penalties.length > 0) {
                    await this.handlePenalties(penalties, username)
                }

                // Emit chat message event (for potential display)
                const chatMessage: ChatMessage = {
                    username: displayName,
                    message: message,
                    timestamp: Date.now(),
                    penalties: penalties.map(p => p.word)
                }

                // This would be emitted via the main service's socket.io
                console.log(`Chat from ${displayName}: ${message}${penalties.length > 0 ? ` [${penalties.length} penalties]` : ''}`)

            } catch (error) {
                console.error('Error processing chat message:', error)
            }
        })

        // tmi.js Client does not support 'error' event directly; errors are usually thrown or handled via promise rejections.
    }

    private checkMessageForProfanity(message: string, username: string): PenaltyEvent[] {
        const allWords = [...this.predefinedWords, ...this.customWords]
        const messageWords = message.toLowerCase().split(/\s+/)
        const penalties: PenaltyEvent[] = []

        // Check cooldown for this user
        const lastPenaltyTime = this.userCooldowns.get(username) || 0
        const now = Date.now()

        if (now - lastPenaltyTime < this.COOLDOWN_MS) {
            return penalties // User is on cooldown
        }

        // Find profanity in message
        for (const word of messageWords) {
            const cleanWord = word.replace(/[^\w]/g, '').toLowerCase()

            if (cleanWord && allWords.includes(cleanWord)) {
                penalties.push({
                    word: cleanWord,
                    source: 'chat',
                    username: username,
                    timestamp: now,
                    sessionId: this.currentSessionId || undefined
                })
            }
        }

        return penalties
    }

    private async handlePenalties(penalties: PenaltyEvent[], username: string): Promise<void> {
        try {
            // Add penalties to database
            for (const penalty of penalties) {
                await this.database.addPenalty({
                    word: penalty.word,
                    source: 'chat',
                    username: username,
                    session_id: this.currentSessionId ?? undefined
                })
            }

            // Update user penalty count
            await this.database.addOrUpdateUser(username, penalties.length)

            // Update session stats
            if (this.currentSessionId) {
                const session = await this.database.getActiveSession()
                if (session) {
                    await this.database.updateSession(this.currentSessionId, {
                        total_penalties: session.total_penalties + penalties.length,
                        chat_penalties: session.chat_penalties + penalties.length
                    })
                }
            }

            // Set cooldown for user
            this.userCooldowns.set(username, Date.now())

            console.log(`Chat penalties: ${username} - ${penalties.map(p => p.word).join(', ')}`)

        } catch (error) {
            console.error('Error handling chat penalties:', error)
        }
    }

    private async loadCustomWords(): Promise<void> {
        try {
            const customWordsJson = await this.database.getSetting('custom_curse_words')
            if (customWordsJson) {
                this.customWords = JSON.parse(customWordsJson)
            }
        } catch (error) {
            console.error('Error loading custom words for chat monitor:', error)
        }
    }

    public async updateCustomWords(): Promise<void> {
        await this.loadCustomWords()
    }

    public async updateSessionId(sessionId: number): Promise<void> {
        this.currentSessionId = sessionId
    }

    public isActive(): boolean {
        return this.isConnected && this.client !== null
    }

    public async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.disconnect()
            this.client = null
            this.isConnected = false
            console.log('Chat monitor disconnected')
        }
    }

    public getConnectionStatus(): { connected: boolean; channel?: string } {
        return {
            connected: this.isConnected,
            channel: this.client?.getChannels()?.[0]?.substring(1) // Remove # prefix
        }
    }

    // Method to get recent chat statistics
    public async getChatStats(): Promise<{
        totalUsers: number
        totalMessages: number
        totalPenalties: number
        topOffenders: Array<{ username: string; count: number }>
    }> {
        try {
            const topUsers = await this.database.getTopUsers(10)
            const chatPenalties = await this.database.getPenaltyCount('chat')

            return {
                totalUsers: topUsers.length,
                totalMessages: topUsers.reduce((sum, user) => sum + user.total_messages, 0),
                totalPenalties: chatPenalties,
                topOffenders: topUsers.map(user => ({
                    username: user.username,
                    count: user.penalty_count
                }))
            }
        } catch (error) {
            console.error('Error getting chat stats:', error)
            return {
                totalUsers: 0,
                totalMessages: 0,
                totalPenalties: 0,
                topOffenders: []
            }
        }
    }

    // Method to reset user cooldowns (for testing or admin purposes)
    public clearCooldowns(): void {
        this.userCooldowns.clear()
    }

    // Method to manually add penalty (for moderation tools)
    public async addManualPenalty(username: string, word: string): Promise<void> {
        const penalty: PenaltyEvent = {
            word: word,
            source: 'chat',
            username: username,
            timestamp: Date.now(),
            sessionId: this.currentSessionId || undefined
        }

        await this.handlePenalties([penalty], username)
    }
}