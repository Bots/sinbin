/**
 * SinBin Tab Management System
 * Handles tab switching and content management
 */
class SinBinTabs {
    constructor(state, api) {
        this.state = state
        this.api = api
        this.tabs = new Map()
        this.currentTab = null

        this.initialize()
    }

    initialize() {
        // Register all tabs
        this.registerTab('dashboard', new DashboardTab(this.state, this.api))
        this.registerTab('speech', new SpeechTab(this.state, this.api))
        this.registerTab('chat', new ChatTab(this.state, this.api))
        this.registerTab('sounds', new SoundsTab(this.state, this.api))
        this.registerTab('overlay', new OverlayTab(this.state, this.api))
        this.registerTab('settings', new SettingsTab(this.state, this.api))

        // Set up event listeners
        this.setupEventListeners()

        // Show initial tab
        this.showTab(this.state.get('currentTab') || 'dashboard')
    }

    registerTab(name, tabInstance) {
        this.tabs.set(name, tabInstance)
    }

    setupEventListeners() {
        // Tab click handlers
        document.querySelectorAll('[data-tab]').forEach(tabElement => {
            tabElement.addEventListener('click', (e) => {
                e.preventDefault()
                const tabName = e.currentTarget.getAttribute('data-tab')
                this.showTab(tabName)
            })
        })
    }

    showTab(tabName) {
        console.log('showTab called with:', tabName)

        // Hide all tab content
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active')
            console.log('Removed active from:', pane.id)
        })

        // Remove active class from all tab buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('tab-active')
        })

        // Show target tab content
        const targetPane = document.getElementById(`${tabName}-tab`)
        console.log('Target pane:', targetPane)
        if (targetPane) {
            targetPane.classList.add('active')
            console.log('Added active to:', targetPane.id)
        } else {
            console.error('Target pane not found:', `${tabName}-tab`)
        }

        // Add active class to clicked tab button
        const targetButton = document.querySelector(`[data-tab="${tabName}"]`)
        if (targetButton) {
            targetButton.classList.add('tab-active')
        }

        // Deactivate current tab
        if (this.currentTab && this.tabs.has(this.currentTab)) {
            this.tabs.get(this.currentTab).onDeactivate()
        }

        // Activate new tab
        if (this.tabs.has(tabName)) {
            this.tabs.get(tabName).onActivate()
        }

        this.currentTab = tabName
        this.state.update({ currentTab: tabName })
    }

    getCurrentTab() {
        return this.currentTab
    }

    getTab(name) {
        return this.tabs.get(name)
    }
}

/**
 * Base Tab Class
 * All tabs should extend this class
 */
class BaseTab {
    constructor(state, api) {
        this.state = state
        this.api = api
        this.subscriptions = []
        this.isActive = false
    }

    onActivate() {
        this.isActive = true
        this.render()
        this.bindEvents()
    }

    onDeactivate() {
        this.isActive = false
        this.unbindEvents()
    }

    render() {
        // Override in subclasses
    }

    bindEvents() {
        // Override in subclasses
    }

    unbindEvents() {
        // Clean up event listeners
        this.subscriptions.forEach(unsubscribe => unsubscribe())
        this.subscriptions = []
    }

    subscribe(key, callback) {
        const unsubscribe = this.state.subscribe(key, callback)
        this.subscriptions.push(unsubscribe)
        return unsubscribe
    }

    updateElement(selector, value) {
        const element = document.querySelector(selector)
        if (element) {
            if (element.tagName === 'INPUT') {
                if (element.type === 'checkbox') {
                    element.checked = Boolean(value)
                } else {
                    element.value = value
                }
            } else {
                element.textContent = value
            }
        }
    }
}

/**
 * Dashboard Tab
 */
class DashboardTab extends BaseTab {
    onActivate() {
        super.onActivate()
        this.loadDashboardData()
    }

    bindEvents() {
        this.subscribe('counts', (counts) => {
            this.updateElement('#micCount', counts.mic || 0)
            this.updateElement('#chatCount', counts.chat || 0)
            this.updateElement('#totalCount', counts.total || 0)
            this.updateElement('#cleanStreak', Math.floor((counts.cleanStreak || 0) / 60000))
        })

        this.subscribe('session', (session) => {
            this.updateElement('#sessionDuration', this.state.formatDuration(session.duration))
            this.updateElement('#penaltiesPerHour', session.penaltiesPerHour || 0)
            this.updateElement('#worstWord', session.worstWord || 'None')
        })

        this.subscribe('speechStatus', (status) => {
            const element = document.getElementById('speechStatus')
            if (element) {
                element.textContent = status === 'listening' ? 'Listening' : 'Stopped'
                element.className = status === 'listening' ? 'badge badge-success' : 'badge badge-error'
            }
        })

        this.subscribe('chatStatus', (status) => {
            const element = document.getElementById('chatStatus')
            if (element) {
                element.textContent = status.charAt(0).toUpperCase() + status.slice(1)
                element.className = status === 'connected' ? 'badge badge-success' : 'badge badge-error'
            }
        })

        this.subscribe('recentActivity', (activities) => {
            this.renderRecentActivity(activities)
        })
        // Top users / offenders
        this.subscribe('topUsers', (users) => {
            this.renderTopUsers(users)
        })
        // support alternate shape where topOffenders is provided under chat
        this.subscribe('chat.topOffenders', (users) => {
            this.renderTopUsers(users)
        })
    }

    async loadDashboardData() {
        // Load initial dashboard data
        try {
            const [stats, chatStats] = await Promise.all([
                this.api.getStats(),
                this.api.getChatStats()
            ])

            this.state.update({
                counts: {
                    ...stats.penalties || {},
                    cleanStreak: stats.session?.clean_streak_best || 0
                },
                session: stats.session || {},
                chat: {
                    ...this.state.get('chat'),
                    stats: chatStats || {}
                }
            })
        } catch (error) {
            console.error('Error loading dashboard data:', error)
        }
    }

    renderRecentActivity(activities) {
        const container = document.getElementById('recentActivity')
        if (!container) return
        // Normalize activities to an array
        let list = []
        if (Array.isArray(activities)) list = activities
        else if (activities && typeof activities === 'object' && Array.isArray(activities.data)) list = activities.data

        if (!list || list.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 py-8">No recent activity</div>'
            return
        }

        container.innerHTML = list.map(activity => `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <div class="font-bold">${activity.source === 'mic' ? 'Microphone' : 'Chat'} Penalty</div>
                    <div class="text-xs">${activity.word} - ${new Date(activity.timestamp).toLocaleTimeString()}</div>
                </div>
            </div>
        `).join('')
    }

    renderTopUsers(users) {
        const tbody = document.getElementById('topUsersTable')
        if (!tbody) return

        // Normalize to array
        let list = []
        if (Array.isArray(users)) list = users
        else if (users && typeof users === 'object') {
            if (Array.isArray(users.topOffenders)) list = users.topOffenders
            else if (Array.isArray(users.users)) list = users.users
            else if (Array.isArray(users.data)) list = users.data
        }

        if (!list || list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-500">No data available</td></tr>'
            return
        }

        tbody.innerHTML = list.map((u, i) => {
            const username = u.username || u.user || u.name || 'Unknown'
            const penalties = u.count || u.penalties || u.total_messages || 0
            const messages = u.messages || u.total_messages || 0
            return `
                <tr>
                    <td>${i + 1}</td>
                    <td>${username}</td>
                    <td>${penalties}</td>
                    <td>${messages}</td>
                </tr>
            `
        }).join('')
    }
}

/**
 * Speech Tab
 */
class SpeechTab extends BaseTab {
    onActivate() {
        super.onActivate()
        this.loadWords()
    }

    bindEvents() {
        this.subscribe('words', (words) => {
            this.renderWordLists(words)
        })

        this.subscribe('liveTranscript', (transcript) => {
            this.updateElement('#liveTranscript', transcript)
        })

        // Add word form
        const addWordForm = document.getElementById('newWordInput')
        if (addWordForm) {
            addWordForm.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addCustomWord()
                }
            })
        }
    }

    async loadWords() {
        try {
            const words = await window.sinBinApp.api.getWords()
            this.state.update({ words })
        } catch (error) {
            console.error('Error loading words:', error)
        }
    }

    async addCustomWord() {
        const input = document.getElementById('newWordInput')
        const word = input.value.trim().toLowerCase()
        if (!word) return

        try {
            await window.sinBinApp.api.addWord(word)
            input.value = ''
            await this.loadWords()
        } catch (error) {
            console.error('Error adding word:', error)
            alert('Failed to add word')
        }
    }

    async removeCustomWord(word) {
        try {
            await window.sinBinApp.api.removeWord(word)
            await this.loadWords()
        } catch (error) {
            console.error('Error removing word:', error)
            alert('Failed to remove word')
        }
    }

    renderWordLists(words) {
        // Custom words
        const customContainer = document.getElementById('customWords')
        if (customContainer) {
            const customList = (words && Array.isArray(words.custom)) ? words.custom : []
            if (customList.length === 0) {
                customContainer.innerHTML = '<div class="text-center text-gray-500 py-4">No custom words added</div>'
            } else {
                customContainer.innerHTML = customList.map(word => `
                    <div class="flex justify-between items-center p-2 bg-base-200 rounded">
                        <span>${word}</span>
                        <button class="btn btn-error btn-xs" onclick="window.sinBinApp.tabs.getTab('speech').removeCustomWord('${word}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `).join('')
            }
        }

        // Predefined words
        const predefinedContainer = document.getElementById('predefinedWords')
        if (predefinedContainer) {
            const predefinedList = (words && Array.isArray(words.predefined)) ? words.predefined : []
            if (predefinedList.length === 0) {
                predefinedContainer.innerHTML = '<div class="text-center text-gray-500 py-4">No predefined words</div>'
            } else {
                predefinedContainer.innerHTML = predefinedList.map(word => `
                    <div class="p-2 bg-base-200 rounded">
                        <span>${word}</span>
                    </div>
                `).join('')
            }
        }
    }

    showWordList(type) {
        document.querySelectorAll('#customWords, #predefinedWords').forEach(el => {
            el.classList.add('hidden')
        })
        document.getElementById(`${type}Words`).classList.remove('hidden')

        // Update tab buttons
        document.querySelectorAll('.tabs-boxed .tab').forEach(tab => {
            tab.classList.remove('tab-active')
        })
        event.target.classList.add('tab-active')
    }
}

/**
 * Chat Tab
 */
class ChatTab extends BaseTab {
    bindEvents() {
        this.subscribe('chat', (chat) => {
            this.updateElement('#chatChannel', chat.channel)
            this.updateElement('#chatUsername', chat.username)
            this.updateElement('#activeUsers', chat.stats.activeUsers || 0)
            this.updateElement('#totalMessages', chat.stats.totalMessages || 0)
            this.updateElement('#chatPenalties', chat.stats.penalties || 0)
        })
    }

    async connectChat() {
        const channel = document.getElementById('chatChannel').value.trim()
        const username = document.getElementById('chatUsername').value.trim()
        const oauth = document.getElementById('chatOAuth').value.trim()

        if (!channel) {
            alert('Channel name is required')
            return
        }

        try {
            this.state.update({ chatStatus: 'connecting' })
            await window.sinBinApp.api.connectChat(channel, username, oauth)
            this.state.update({
                chatStatus: 'connected',
                chat: {
                    ...this.state.get('chat'),
                    channel,
                    username
                }
            })
        } catch (error) {
            console.error('Error connecting to chat:', error)
            this.state.update({ chatStatus: 'disconnected' })
            alert('Failed to connect to chat')
        }
    }

    async disconnectChat() {
        try {
            await window.sinBinApp.api.disconnectChat()
            this.state.update({ chatStatus: 'disconnected' })
        } catch (error) {
            console.error('Error disconnecting from chat:', error)
        }
    }
}

/**
 * Sounds Tab
 */
class SoundsTab extends BaseTab {
    onActivate() {
        super.onActivate()
        this.loadSounds()
    }

    bindEvents() {
        this.subscribe('sounds', (sounds) => {
            this.renderSoundLibrary(sounds)
        })
    }

    async loadSounds() {
        try {
            const sounds = await window.sinBinApp.api.getSounds()
            this.state.update({ sounds })
        } catch (error) {
            console.error('Error loading sounds:', error)
        }
    }

    async uploadSound() {
        const fileInput = document.getElementById('soundFile')
        const category = document.getElementById('soundCategory').value
        const description = document.getElementById('soundDescription').value.trim()

        if (!fileInput.files[0]) {
            alert('Please select an audio file')
            return
        }

        if (!description) {
            alert('Please provide a description')
            return
        }

        const formData = new FormData()
        formData.append('soundFile', fileInput.files[0])
        formData.append('category', category)
        formData.append('description', description)

        try {
            await window.sinBinApp.api.uploadSound(formData)
            fileInput.value = ''
            document.getElementById('soundDescription').value = ''
            await this.loadSounds()
        } catch (error) {
            console.error('Error uploading sound:', error)
            alert('Failed to upload sound')
        }
    }

    async deleteSound(filename) {
        if (confirm('Are you sure you want to delete this sound?')) {
            try {
                await window.sinBinApp.api.deleteSound(filename)
                await this.loadSounds()
            } catch (error) {
                console.error('Error deleting sound:', error)
                alert('Failed to delete sound')
            }
        }
    }

    async playSound(filename) {
        try {
            await window.sinBinApp.api.playSound(filename)
        } catch (error) {
            console.error('Error playing sound:', error)
        }
    }

    renderSoundLibrary(sounds) {
        const container = document.getElementById('soundLibrary')
        if (!container) return
        // Normalize input: accept an array, or an object with .data or .sounds arrays
        let list = []
        if (Array.isArray(sounds)) {
            list = sounds
        } else if (sounds && typeof sounds === 'object') {
            if (Array.isArray(sounds.data)) list = sounds.data
            else if (Array.isArray(sounds.sounds)) list = sounds.sounds
        }

        if (!list || list.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 py-8">No custom sounds uploaded</div>'
            return
        }

        container.innerHTML = list.map(sound => `
            <div class="card card-compact bg-base-200">
                <div class="card-body">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="font-bold">${sound.description || sound.filename}</h3>
                            <p class="text-xs opacity-70">${sound.category || ''}</p>
                        </div>
                        <div class="flex gap-2">
                            <button class="btn btn-primary btn-xs" onclick="window.sinBinApp.tabs.getTab('sounds').playSound('${sound.filename}')">
                                <i class="fas fa-play"></i>
                            </button>
                            <button class="btn btn-error btn-xs" onclick="window.sinBinApp.tabs.getTab('sounds').deleteSound('${sound.filename}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('')
    }
}

/**
 * Overlay Tab
 */
class OverlayTab extends BaseTab {
    bindEvents() {
        this.subscribe('settings', (settings) => {
            this.updateElement('#overlayLayout', settings.layout)
            this.updateElement('#transcriptPosition', settings.transcriptPosition)
            this.updateElement('#showBackground', settings.showBackground)
            this.updateElement('#showTranscript', settings.showTranscript)
        })

        this.subscribe('thresholds', (thresholds) => {
            this.updateElement('#warningThreshold', thresholds.warning.count)
            this.updateElement('#warningColor', thresholds.warning.color)
            this.updateElement('#dangerThreshold', thresholds.danger.count)
            this.updateElement('#dangerColor', thresholds.danger.color)
        })
    }

    async saveOverlaySettings() {
        const settings = {
            layout: document.getElementById('overlayLayout').value,
            transcriptPosition: document.getElementById('transcriptPosition').value,
            showBackground: document.getElementById('showBackground').checked,
            showTranscript: document.getElementById('showTranscript').checked
        }

        try {
            await window.sinBinApp.api.updateSettings(settings)
            this.state.update({ settings: { ...this.state.get('settings'), ...settings } })
            alert('Overlay settings saved!')
        } catch (error) {
            console.error('Error saving overlay settings:', error)
            alert('Failed to save settings')
        }
    }

    async saveThresholds() {
        const thresholds = {
            warning: {
                count: parseInt(document.getElementById('warningThreshold').value),
                color: document.getElementById('warningColor').value
            },
            danger: {
                count: parseInt(document.getElementById('dangerThreshold').value),
                color: document.getElementById('dangerColor').value
            }
        }

        try {
            await window.sinBinApp.api.updateThresholds(thresholds)
            this.state.update({ thresholds })
            alert('Thresholds saved!')
        } catch (error) {
            console.error('Error saving thresholds:', error)
            alert('Failed to save thresholds')
        }
    }
}

/**
 * Settings Tab
 */
class SettingsTab extends BaseTab {
    bindEvents() {
        this.subscribe('settings', (settings) => {
            this.updateElement('#autoResetEnabled', settings.autoResetEnabled)
            this.updateElement('#autoResetDuration', settings.autoResetDuration)
        })
    }

    async saveAutoResetSettings() {
        const settings = {
            enabled: document.getElementById('autoResetEnabled').checked,
            duration: parseInt(document.getElementById('autoResetDuration').value)
        }

        try {
            await window.sinBinApp.api.updateAutoResetSettings(settings)
            this.state.update({
                settings: {
                    ...this.state.get('settings'),
                    autoResetEnabled: settings.enabled,
                    autoResetDuration: settings.duration
                }
            })
            alert('Auto-reset settings saved!')
        } catch (error) {
            console.error('Error saving auto-reset settings:', error)
            alert('Failed to save settings')
        }
    }

    async resetSession() {
        if (confirm('Are you sure you want to reset the current session? This will clear all session data.')) {
            try {
                await window.sinBinApp.api.resetSession()
                location.reload()
            } catch (error) {
                console.error('Error resetting session:', error)
                alert('Failed to reset session')
            }
        }
    }

    async exportData() {
        try {
            const data = await window.sinBinApp.api.exportData()
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `sinbin-session-${new Date().toISOString().split('T')[0]}.json`
            a.click()
            URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Error exporting data:', error)
            alert('Failed to export data')
        }
    }

    async resetAllData() {
        if (confirm('Are you sure you want to reset ALL data? This cannot be undone!')) {
            if (confirm('This will delete all sessions, penalties, and user data. Are you absolutely sure?')) {
                try {
                    await window.sinBinApp.api.resetAllData()
                    location.reload()
                } catch (error) {
                    console.error('Error resetting all data:', error)
                    alert('Failed to reset all data')
                }
            }
        }
    }
}

// Export for use in other files
window.SinBinTabs = SinBinTabs