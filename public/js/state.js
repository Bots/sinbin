/**
 * SinBin State Management
 * Centralized state management with reactive updates
 */
class SinBinState {
    constructor() {
        this.state = {
            // Connection state
            connected: false,
            speechStatus: 'stopped', // 'listening' | 'stopped'
            chatStatus: 'disconnected', // 'connected' | 'disconnected' | 'connecting'

            // Counts and stats
            counts: {
                total: 0,
                mic: 0,
                chat: 0,
                cleanStreak: 0
            },

            // Current session
            session: {
                duration: 0,
                penaltiesPerHour: 0,
                worstWord: 'None',
                startTime: null
            },

            // Live data
            liveTranscript: 'Waiting for speech...',
            recentActivity: [],

            // Configuration
            settings: {
                layout: 'vertical',
                transcriptPosition: 'below',
                showBackground: true,
                showTranscript: true,
                autoResetEnabled: false,
                autoResetDuration: 30,
                soundEnabled: true,
                soundVolume: 0.5
            },

            // Data
            words: {
                custom: [],
                predefined: []
            },

            sounds: [],

            thresholds: {
                warning: { count: 5, color: '#f59e0b' },
                danger: { count: 10, color: '#ef4444' }
            },

            // Chat data
            chat: {
                channel: '',
                username: '',
                oauth: '',
                stats: {
                    activeUsers: 0,
                    totalMessages: 0,
                    penalties: 0
                },
                topUsers: []
            },

            // UI state
            currentTab: 'dashboard',
            theme: 'light',
            loading: {
                words: false,
                sounds: false,
                stats: false
            }
        }

        this.listeners = new Map()
        this.sessionTimer = null

        // Start session timer
        this.startSessionTimer()
    }

    // Subscribe to state changes
    subscribe(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set())
        }
        this.listeners.get(key).add(callback)

        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(key)
            if (callbacks) {
                callbacks.delete(callback)
            }
        }
    }

    // Update state and notify listeners
    update(updates) {
        const prevState = { ...this.state }

        // Deep merge updates
        this.state = this.deepMerge(this.state, updates)

        // Notify listeners for changed keys
        this.notifyListeners(prevState, this.state)
    }

    // Get current state
    get(key) {
        return key ? this.getNestedValue(this.state, key) : this.state
    }

    // Deep merge helper
    deepMerge(target, source) {
        const result = { ...target }

        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(target[key] || {}, source[key])
            } else {
                result[key] = source[key]
            }
        }

        return result
    }

    // Get nested value helper
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj)
    }

    // Notify listeners of changes
    notifyListeners(prevState, newState) {
        const changedKeys = this.getChangedKeys(prevState, newState)

        changedKeys.forEach(key => {
            const callbacks = this.listeners.get(key)
            if (callbacks) {
                const value = this.getNestedValue(newState, key)
                callbacks.forEach(callback => {
                    try {
                        callback(value, key)
                    } catch (error) {
                        console.error(`Error in state listener for ${key}:`, error)
                    }
                })
            }
        })

        // Always notify '*' listeners (global listeners)
        const globalCallbacks = this.listeners.get('*')
        if (globalCallbacks) {
            globalCallbacks.forEach(callback => {
                try {
                    callback(newState, changedKeys)
                } catch (error) {
                    console.error('Error in global state listener:', error)
                }
            })
        }
    }

    // Find changed keys between states
    getChangedKeys(prev, current, prefix = '') {
        const keys = new Set()

        const allKeys = new Set([...Object.keys(prev), ...Object.keys(current)])

        allKeys.forEach(key => {
            const fullKey = prefix ? `${prefix}.${key}` : key
            const prevValue = prev[key]
            const currentValue = current[key]

            if (prevValue !== currentValue) {
                keys.add(fullKey)

                // If both are objects, check nested keys
                if (prevValue && currentValue &&
                    typeof prevValue === 'object' && typeof currentValue === 'object' &&
                    !Array.isArray(prevValue) && !Array.isArray(currentValue)) {

                    const nestedKeys = this.getChangedKeys(prevValue, currentValue, fullKey)
                    nestedKeys.forEach(nestedKey => keys.add(nestedKey))
                }
            }
        })

        return Array.from(keys)
    }

    // Session timer
    startSessionTimer() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer)
        }

        this.update({
            session: {
                ...this.state.session,
                startTime: Date.now()
            }
        })

        this.sessionTimer = setInterval(() => {
            const duration = Date.now() - (this.state.session.startTime || Date.now())
            this.update({
                session: {
                    ...this.state.session,
                    duration
                }
            })
        }, 1000)
    }

    // Add recent activity
    addActivity(activity) {
        const recentActivity = [activity, ...this.state.recentActivity].slice(0, 10)
        this.update({ recentActivity })
    }

    // Format duration helper
    formatDuration(ms) {
        const hours = Math.floor(ms / 3600000)
        const minutes = Math.floor((ms % 3600000) / 60000)
        const seconds = Math.floor((ms % 60000) / 1000)
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }

    // Save to localStorage
    saveToStorage() {
        try {
            const toSave = {
                settings: this.state.settings,
                theme: this.state.theme,
                chat: {
                    channel: this.state.chat.channel,
                    username: this.state.chat.username
                    // Don't save OAuth token
                }
            }
            localStorage.setItem('sinbin-state', JSON.stringify(toSave))
        } catch (error) {
            console.error('Error saving state to localStorage:', error)
        }
    }

    // Load from localStorage
    loadFromStorage() {
        try {
            const saved = localStorage.getItem('sinbin-state')
            if (saved) {
                const data = JSON.parse(saved)
                this.update(data)
            }
        } catch (error) {
            console.error('Error loading state from localStorage:', error)
        }
    }

    // Cleanup
    destroy() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer)
        }
        this.listeners.clear()
    }
}

// Export for use in other files
window.SinBinState = SinBinState