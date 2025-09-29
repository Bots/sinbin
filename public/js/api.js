/**
 * SinBin API Service Layer
 * Handles all communication with the backend server
 */
class SinBinAPI {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl
        this.socket = null
    }

    // Initialize WebSocket connection
    initializeSocket() {
        this.socket = io()
        return this.socket
    }

    // Generic API request handler
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        }

        try {
            const response = await fetch(url, config)

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Network error' }))
                throw new Error(error.error || `HTTP ${response.status}`)
            }

            return await response.json()
        } catch (error) {
            console.error(`API Error: ${endpoint}`, error)
            throw error
        }
    }

    // Stats and Dashboard
    async getStats() {
        return this.request('/api/stats')
    }

    async getCount() {
        return this.request('/api/count')
    }

    async resetCounter() {
        return this.request('/api/reset', { method: 'POST' })
    }

    async resetSession() {
        return this.request('/api/reset-session', { method: 'POST' })
    }

    async resetAllData() {
        return this.request('/api/reset-all', { method: 'POST' })
    }

    async exportData() {
        return this.request('/api/export')
    }

    // Word Management
    async getWords() {
        return this.request('/api/words')
    }

    async addWord(word) {
        return this.request('/api/add-word', {
            method: 'POST',
            body: JSON.stringify({ word })
        })
    }

    async removeWord(word) {
        return this.request(`/api/remove-word/${encodeURIComponent(word)}`, {
            method: 'DELETE'
        })
    }

    // Sound Management
    async getSounds() {
        return this.request('/api/sounds')
    }

    async uploadSound(formData) {
        return this.request('/api/sounds/upload', {
            method: 'POST',
            headers: {}, // Let browser set content-type for FormData
            body: formData
        })
    }

    async deleteSound(filename) {
        return this.request(`/api/sounds/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        })
    }

    async playSound(filename, volume = 0.5) {
        return this.request('/api/sounds/play', {
            method: 'POST',
            body: JSON.stringify({ filename, volume })
        })
    }

    async testSound() {
        return this.request('/api/test-sound', { method: 'POST' })
    }

    // Sound Settings
    async updateSoundSettings(settings) {
        return this.request('/api/sound-settings', {
            method: 'POST',
            body: JSON.stringify(settings)
        })
    }

    // Chat Integration
    async connectChat(channel, username = '', oauth = '') {
        return this.request('/api/chat/connect', {
            method: 'POST',
            body: JSON.stringify({ channel, username, oauth })
        })
    }

    async disconnectChat() {
        return this.request('/api/chat/disconnect', { method: 'POST' })
    }

    async getChatStatus() {
        return this.request('/api/chat/status')
    }

    async getChatStats() {
        return this.request('/api/chat/stats')
    }

    // Users
    async getUsers() {
        return this.request('/api/users')
    }

    // Settings
    async getSetting(key) {
        return this.request(`/api/settings/${key}`)
    }

    async updateSetting(key, value) {
        return this.request('/api/settings', {
            method: 'POST',
            body: JSON.stringify({ key, value })
        })
    }

    async updateSettings(settings) {
        const promises = Object.entries(settings).map(([key, value]) =>
            this.updateSetting(key, value)
        )
        return Promise.all(promises)
    }

    // Thresholds
    async getThresholds() {
        return this.request('/api/thresholds')
    }

    async updateThresholds(thresholds) {
        return this.request('/api/thresholds', {
            method: 'POST',
            body: JSON.stringify(thresholds)
        })
    }

    // Auto-reset
    async updateAutoResetSettings(settings) {
        return this.request('/api/auto-reset', {
            method: 'POST',
            body: JSON.stringify(settings)
        })
    }

    // WebSocket helpers
    onCountUpdate(callback) {
        if (this.socket) {
            this.socket.on('countUpdate', callback)
        }
    }

    onTranscriptUpdate(callback) {
        if (this.socket) {
            this.socket.on('transcriptUpdate', callback)
        }
    }

    onPenaltyDetected(callback) {
        if (this.socket) {
            this.socket.on('penaltyDetected', callback)
        }
    }

    onStatusUpdate(callback) {
        if (this.socket) {
            this.socket.on('statusUpdate', callback)
        }
    }

    onSoundPlay(callback) {
        if (this.socket) {
            this.socket.on('soundPlay', callback)
        }
    }

    onThresholdReached(callback) {
        if (this.socket) {
            this.socket.on('thresholdReached', callback)
        }
    }

    onAutoResetTriggered(callback) {
        if (this.socket) {
            this.socket.on('autoResetTriggered', callback)
        }
    }

    onAnimationTrigger(callback) {
        if (this.socket) {
            this.socket.on('animationTrigger', callback)
        }
    }

    // Utility methods
    showNotification(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 300px;
            word-wrap: break-word;
        `;

        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        notification.style.backgroundColor = colors[type] || colors.info;

        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 10);

        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }

    downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    formatDate(dateString) {
        if (!dateString) return 'Never';
        return new Date(dateString).toLocaleString();
    }

    // Speech Recognition Controls
    startListening() {
        if (this.socket) {
            this.socket.emit('startListening')
        }
    }

    stopListening() {
        if (this.socket) {
            this.socket.emit('stopListening')
        }
    }

    // Display options
    updateDisplayOptions(options) {
        if (this.socket) {
            this.socket.emit('displayOptionsUpdate', options)
        }
    }
}

// Export for use in other files
window.SinBinAPI = SinBinAPI