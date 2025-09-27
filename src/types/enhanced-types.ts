// Enhanced types for SinBin features

export interface SwearJarConfig {
    predefinedCurseWords: string[]
    customCurseWords: string[]
    swearCount: number
}

export interface EnhancedConfig {
    // Existing config
    predefinedCurseWords: string[]
    customCurseWords: string[]

    // Penalty thresholds
    thresholds: {
        warning: number
        danger: number
        colors: {
            safe: string
            warning: string
            danger: string
        }
    }

    // Auto-reset functionality
    autoReset: {
        enabled: boolean
        duration: number // minutes
        lastResetTime?: number
    }

    // Chat integration
    chat: {
        enabled: boolean
        channel: string
        separateCounter: boolean
        username?: string
        oauth?: string
    }

    // Firebot integration
    firebot: {
        enabled: boolean
        endpoint: string
        counters: {
            mic: string
            chat: string
            total: string
        }
    }

    // Animation settings
    animations: {
        binShake: {
            enabled: boolean
            intensity: number
            duration: number
        }
        lidTip: {
            enabled: boolean
            duration: number
            angle: number
        }
    }

    // Goal tracking
    goals: {
        daily: number
        session: number
        type: 'under' | 'exact' | 'over'
        notifications: boolean
    }

    // Sound settings
    sounds: {
        enabled: boolean
        volume: number
        customSounds: {
            penalty: string
            threshold: string
            goal: string
        }
    }

    // Hotkey settings
    hotkeys: {
        enabled: boolean
        addPenalty: string
        subtractPenalty: string
        reset: string
        toggleListening: string
    }
}

export interface PenaltyEvent {
    word: string
    source: 'mic' | 'chat'
    username?: string
    confidence?: number
    timestamp: number
    sessionId?: number
}

export interface ChatMessage {
    username: string
    message: string
    timestamp: number
    penalties: string[]
}

export interface UserStats {
    username: string
    penaltyCount: number
    totalMessages: number
    firstSeen: string
    lastPenalty?: string
    rank?: number
}

export interface SessionStats {
    id: number
    startTime: string
    endTime?: string
    totalPenalties: number
    micPenalties: number
    chatPenalties: number
    cleanStreakBest: number
    active: boolean
    duration?: number
}

export interface ThresholdConfig {
    id?: number
    name: string
    count: number
    color: string
    soundFile?: string
    active: boolean
}

export interface GoalConfig {
    id?: number
    type: 'daily' | 'session' | 'weekly'
    targetCount: number
    targetType: 'under' | 'exact' | 'over'
    startDate?: string
    endDate?: string
    achieved: boolean
    progress?: number
}

export interface AnalyticsData {
    totalPenalties: number
    todayPenalties: number
    sessionPenalties: number
    avgPenaltiesPerDay: number
    avgPenaltiesPerSession: number
    topWords: Array<{ word: string; count: number }>
    topUsers: Array<{ username: string; count: number }>
    cleanStreak: number
    longestCleanStreak: number
    penaltyTrend: Array<{ date: string; count: number }>
}

export interface HotkeyAction {
    action: string
    key: string
    modifiers?: string[]
    enabled: boolean
}

export interface FirebotCounterUpdate {
    counterName: string
    value: number
    increment?: boolean
}

export interface SoundFile {
    id: string
    name: string
    filename: string
    category: 'penalty' | 'threshold' | 'goal' | 'system'
    uploadDate: string
    fileSize: number
}

export interface AnimationConfig {
    name: string
    enabled: boolean
    duration: number
    intensity?: number
    trigger: 'penalty' | 'threshold' | 'goal' | 'manual'
}

export interface OverlayState {
    penaltyCount: number
    currentThreshold: ThresholdConfig
    goalProgress: number
    cleanStreak: number
    isListening: boolean
    chatConnected: boolean
    sessionActive: boolean
    lastPenalty?: PenaltyEvent
}

// WebSocket event types
export interface SocketEvents {
    // Existing events
    countUpdate: number
    transcriptUpdate: string
    statusUpdate: string
    themeUpdate: any
    displayOptionsUpdate: any

    // New events
    penaltyDetected: PenaltyEvent
    thresholdReached: ThresholdConfig
    goalAchieved: GoalConfig
    animationTrigger: { type: string; data: any }
    chatMessage: ChatMessage
    userStatsUpdate: UserStats[]
    sessionStatsUpdate: SessionStats
    analyticsUpdate: AnalyticsData
    soundPlay: { file: string; volume: number }
    autoResetTriggered: { resetTime: number }
    hotkeyPressed: { action: string }
}

// API Response types
export interface ApiResponse<T = any> {
    success: boolean
    data?: T
    error?: string
    message?: string
}

export interface StatsResponse {
    penalties: {
        total: number
        mic: number
        chat: number
        today: number
        session: number
    }
    users: UserStats[]
    session: SessionStats
    goals: GoalConfig[]
    thresholds: ThresholdConfig[]
}

export interface UploadResponse {
    filename: string
    originalName: string
    size: number
    url: string
}

// Configuration validation types
export interface ConfigValidation {
    isValid: boolean
    errors: string[]
    warnings: string[]
}

export interface DatabaseMigration {
    version: string
    description: string
    up: () => Promise<void>
    down: () => Promise<void>
}