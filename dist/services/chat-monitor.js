"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatMonitor = void 0;
const tmi_js_1 = __importDefault(require("tmi.js"));
class ChatMonitor {
    constructor(database) {
        this.client = null;
        this.customWords = [];
        this.predefinedWords = [
            'fuck', 'shit', 'damn', 'hell', 'bitch', 'ass', 'asshole', 'bastard',
            'crap', 'piss', 'cock', 'dick', 'pussy', 'tits', 'goddamn',
            'motherfucker', 'bullshit', 'dammit', 'fuckin', 'fucking',
            'shitty', 'bitchy', 'dickhead', 'douchebag'
        ];
        this.isConnected = false;
        this.currentSessionId = null;
        this.userCooldowns = new Map();
        this.COOLDOWN_MS = 2000;
        this.database = database;
    }
    async initialize(channel, username, oauth) {
        try {
            await this.loadCustomWords();
            const session = await this.database.getActiveSession();
            this.currentSessionId = session?.id || null;
            const clientConfig = {
                connection: {
                    secure: true,
                    reconnect: true,
                },
                channels: [channel]
            };
            if (username && oauth) {
                clientConfig.identity = {
                    username: username,
                    password: oauth
                };
            }
            this.client = new tmi_js_1.default.Client(clientConfig);
            this.setupEventHandlers();
            await this.client.connect();
            console.log(`Connected to Twitch chat: #${channel}`);
            this.isConnected = true;
        }
        catch (error) {
            console.error('Failed to initialize chat monitor:', error);
            throw error;
        }
    }
    setupEventHandlers() {
        if (!this.client)
            return;
        this.client.on('connected', (addr, port) => {
            console.log(`Chat monitor connected to ${addr}:${port}`);
            this.isConnected = true;
        });
        this.client.on('disconnected', (reason) => {
            console.log(`Chat monitor disconnected: ${reason}`);
            this.isConnected = false;
        });
        this.client.on('message', async (channel, userstate, message, self) => {
            if (self)
                return;
            const username = userstate.username || 'unknown';
            const displayName = userstate['display-name'] || username;
            try {
                await this.database.addOrUpdateUser(username, 0);
                const penalties = this.checkMessageForProfanity(message, username);
                if (penalties.length > 0) {
                    await this.handlePenalties(penalties, username);
                }
                const chatMessage = {
                    username: displayName,
                    message: message,
                    timestamp: Date.now(),
                    penalties: penalties.map(p => p.word)
                };
                console.log(`Chat from ${displayName}: ${message}${penalties.length > 0 ? ` [${penalties.length} penalties]` : ''}`);
            }
            catch (error) {
                console.error('Error processing chat message:', error);
            }
        });
    }
    checkMessageForProfanity(message, username) {
        const allWords = [...this.predefinedWords, ...this.customWords];
        const messageWords = message.toLowerCase().split(/\s+/);
        const penalties = [];
        const lastPenaltyTime = this.userCooldowns.get(username) || 0;
        const now = Date.now();
        if (now - lastPenaltyTime < this.COOLDOWN_MS) {
            return penalties;
        }
        for (const word of messageWords) {
            const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
            if (cleanWord && allWords.includes(cleanWord)) {
                penalties.push({
                    word: cleanWord,
                    source: 'chat',
                    username: username,
                    timestamp: now,
                    sessionId: this.currentSessionId || undefined
                });
            }
        }
        return penalties;
    }
    async handlePenalties(penalties, username) {
        try {
            for (const penalty of penalties) {
                await this.database.addPenalty({
                    word: penalty.word,
                    source: 'chat',
                    username: username,
                    session_id: this.currentSessionId ?? undefined
                });
            }
            await this.database.addOrUpdateUser(username, penalties.length);
            if (this.currentSessionId) {
                const session = await this.database.getActiveSession();
                if (session) {
                    await this.database.updateSession(this.currentSessionId, {
                        total_penalties: session.total_penalties + penalties.length,
                        chat_penalties: session.chat_penalties + penalties.length
                    });
                }
            }
            this.userCooldowns.set(username, Date.now());
            console.log(`Chat penalties: ${username} - ${penalties.map(p => p.word).join(', ')}`);
        }
        catch (error) {
            console.error('Error handling chat penalties:', error);
        }
    }
    async loadCustomWords() {
        try {
            const customWordsJson = await this.database.getSetting('custom_curse_words');
            if (customWordsJson) {
                this.customWords = JSON.parse(customWordsJson);
            }
        }
        catch (error) {
            console.error('Error loading custom words for chat monitor:', error);
        }
    }
    async updateCustomWords() {
        await this.loadCustomWords();
    }
    async updateSessionId(sessionId) {
        this.currentSessionId = sessionId;
    }
    isActive() {
        return this.isConnected && this.client !== null;
    }
    async disconnect() {
        if (this.client) {
            await this.client.disconnect();
            this.client = null;
            this.isConnected = false;
            console.log('Chat monitor disconnected');
        }
    }
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            channel: this.client?.getChannels()?.[0]?.substring(1)
        };
    }
    async getChatStats() {
        try {
            const topUsers = await this.database.getTopUsers(10);
            const chatPenalties = await this.database.getPenaltyCount('chat');
            return {
                totalUsers: topUsers.length,
                totalMessages: topUsers.reduce((sum, user) => sum + user.total_messages, 0),
                totalPenalties: chatPenalties,
                topOffenders: topUsers.map(user => ({
                    username: user.username,
                    count: user.penalty_count
                }))
            };
        }
        catch (error) {
            console.error('Error getting chat stats:', error);
            return {
                totalUsers: 0,
                totalMessages: 0,
                totalPenalties: 0,
                topOffenders: []
            };
        }
    }
    clearCooldowns() {
        this.userCooldowns.clear();
    }
    async addManualPenalty(username, word) {
        const penalty = {
            word: word,
            source: 'chat',
            username: username,
            timestamp: Date.now(),
            sessionId: this.currentSessionId || undefined
        };
        await this.handlePenalties([penalty], username);
    }
}
exports.ChatMonitor = ChatMonitor;
//# sourceMappingURL=chat-monitor.js.map