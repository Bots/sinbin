// SinBin Control Panel - Working JavaScript
class SinBinApp {
    constructor() {
        this.socket = null;
        this.currentTab = 'dashboard';
        this.data = {
            count: 0,
            words: { custom: [], predefined: [] },
            sounds: [],
            transcript: 'Waiting for audio...',
            stats: {}
        };

        this.init();
    }

    async init() {
        console.log('Initializing SinBin App...');

        // Initialize theme before everything else
        this.initTheme();

        // Initialize socket connection
        this.initSocket();

        // Setup tab navigation
        this.setupTabs();

        // Load initial data
        await this.loadInitialData();

        // Setup event listeners
        this.setupEventListeners();

        // Update chat status
        await this.updateChatStatus();

        console.log('SinBin App initialized successfully');
    }

    initSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus(true);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus(false);
        });

        this.socket.on('countUpdate', (count) => {
            this.data.count = count;
            this.updateCounter(count);
        });

        this.socket.on('transcriptUpdate', (text) => {
            this.data.transcript = text || 'Waiting for audio...';
            this.updateTranscript(text);
        });

        this.socket.on('penaltyDetected', (penalty) => {
            console.log('Penalty detected:', penalty);
            this.addRecentActivity(penalty);
        });

        this.socket.on('statusUpdate', (status) => {
            console.log('Status update:', status);
            this.updateSpeechStatus(status);
        });
    }

    setupTabs() {
        // Add click listeners to nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const tab = item.getAttribute('onclick');
                if (tab) {
                    const tabName = tab.match(/showTab\('(.+)'\)/)?.[1];
                    if (tabName) {
                        this.showTab(tabName);
                    }
                }
            });
        });
    }

    showTab(tabName) {
        console.log('Switching to tab:', tabName);

        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });

        // Remove active class from nav items
        document.querySelectorAll('.nav-item').forEach(nav => {
            nav.classList.remove('active');
        });

        // Show target tab
        const targetTab = document.getElementById(tabName);
        if (targetTab) {
            targetTab.classList.add('active');
        }

        // Add active class to nav item
        const navItem = document.querySelector(`[onclick="showTab('${tabName}')"]`);
        if (navItem) {
            navItem.classList.add('active');
        }

        this.currentTab = tabName;

        // Load tab-specific data
        this.loadTabData(tabName);
    }

    async loadTabData(tabName) {
        switch (tabName) {
            case 'words':
                await this.loadWords();
                break;
            case 'sounds':
                await this.loadSounds();
                break;
            case 'analytics':
                await this.loadStats();
                break;
            case 'overlay':
                this.loadOverlayStyles();
                break;
        }
    }

    async loadInitialData() {
        try {
            // Load basic data
            await Promise.all([
                this.loadCount(),
                this.loadWords(),
                this.loadSounds(),
                this.loadStats()
            ]);
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    async loadCount() {
        try {
            const response = await fetch('/api/count');
            const data = await response.json();
            this.data.count = data.count;
            this.updateCounter(data.count);
        } catch (error) {
            console.error('Error loading count:', error);
        }
    }

    async loadWords() {
        try {
            const response = await fetch('/api/words');
            const data = await response.json();
            this.data.words = data;
            this.updateWordCounts(data);
            this.updateCustomWordsList(data.custom || []);
            this.updatePredefinedWordsList(data.predefined || []);
        } catch (error) {
            console.error('Error loading words:', error);
        }
    }

    async loadSounds() {
        try {
            const response = await fetch('/api/sounds');
            const data = await response.json();
            this.data.sounds = data.data || data || [];
            this.updateSoundsList(this.data.sounds);
        } catch (error) {
            console.error('Error loading sounds:', error);
        }
    }

    async loadStats() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            this.data.stats = data;
            this.updateStatsDisplay(data);
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    setupEventListeners() {
        // Enter key for adding words
        const newWordInput = document.getElementById('newWord');
        if (newWordInput) {
            newWordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addCustomWord();
                }
            });
        }

        // File input for sounds
        const soundFile = document.getElementById('soundFile');
        if (soundFile) {
            soundFile.addEventListener('change', () => {
                this.uploadSound();
            });
        }

        // Drag and drop for sounds
        this.setupDragDrop();
    }

    setupDragDrop() {
        const dropZone = document.getElementById('soundDropZone');
        if (!dropZone) return;

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');

            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type.startsWith('audio/')) {
                document.getElementById('soundFile').files = files;
                this.uploadSound();
            } else {
                this.showNotification('Please drop an audio file', 'error');
            }
        });
    }

    // UI Update Methods
    updateCounter(count) {
        const counter = document.getElementById('penaltyCounter');
        if (counter) {
            counter.textContent = count;
        }

        const sessionCount = document.getElementById('sessionCount');
        if (sessionCount) {
            sessionCount.textContent = count;
        }
    }

    updateTranscript(text) {
        const transcript = document.getElementById('transcript');
        if (transcript) {
            transcript.textContent = text || 'Waiting for audio input...';
        }
    }

    updateConnectionStatus(connected) {
        const status = document.getElementById('connectionStatus');
        if (status) {
            status.className = `status-indicator ${connected ? 'status-connected' : 'status-disconnected'}`;
        }
    }

    updateSpeechStatus(status) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            const className = status === 'listening' ? 'status-listening' :
                            status === 'connected' ? 'status-connected' : 'status-disconnected';
            statusElement.className = `status-indicator ${className}`;
        }
    }

    updateWordCounts(words) {
        const predefinedCount = document.getElementById('predefinedCount');
        const customCount = document.getElementById('customCount');

        if (predefinedCount) {
            predefinedCount.textContent = (words.predefined || []).length;
        }
        if (customCount) {
            customCount.textContent = (words.custom || []).length;
        }
    }

    updateCustomWordsList(words) {
        const container = document.getElementById('customWordsList');
        if (!container) return;

        if (words.length === 0) {
            container.innerHTML = '<p class=\"text-gray-400 text-center p-4\">No custom words added yet</p>';
            return;
        }

        container.innerHTML = words.map(word => `
            <div class=\"flex items-center justify-between p-3 card\">
                <span class=\"font-medium\">${word}</span>
                <button class=\"btn btn-danger btn-sm\" onclick=\"app.removeCustomWord('${word}')\">
                    <i class=\"fas fa-trash\"></i>
                </button>
            </div>
        `).join('');

        // Ensure words are hidden by default
        this.resetWordListVisibility();
    }

    updatePredefinedWordsList(words) {
        const container = document.getElementById('predefinedWordsList');
        if (!container) return;

        if (words.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center p-4">No predefined words</p>';
            return;
        }

        container.innerHTML = words.map(word => `
            <div class="p-3 card">
                <span class="font-medium">${word}</span>
            </div>
        `).join('');

        // Ensure words are hidden by default
        this.resetWordListVisibility();
    }

    resetWordListVisibility() {
        // Hide all word lists by default
        const predefinedContainer = document.getElementById('predefinedWordsContainer');
        const predefinedList = document.getElementById('predefinedWordsList');
        const customContainer = document.getElementById('customWordsContainer');
        const customList = document.getElementById('customWordsList');
        const predefinedBtn = document.getElementById('showPredefinedWordsBtn');
        const customBtn = document.getElementById('showCustomWordsBtn');

        if (predefinedContainer) predefinedContainer.classList.add('hidden');
        if (predefinedList) predefinedList.classList.add('hidden');
        if (customContainer) customContainer.classList.add('hidden');
        if (customList) customList.classList.add('hidden');

        // Reset button states
        if (predefinedBtn) {
            predefinedBtn.innerHTML = '<i class="fas fa-eye"></i> Show Words';
            predefinedBtn.setAttribute('onclick', 'showPredefinedWords()');
            predefinedBtn.classList.remove('hidden');
        }

        if (customBtn) {
            customBtn.innerHTML = '<i class="fas fa-eye"></i> Show Words';
            customBtn.setAttribute('onclick', 'showCustomWords()');
            customBtn.classList.remove('hidden');
        }
    }

    updateSoundsList(sounds) {
        const container = document.getElementById('soundsList');
        if (!container) return;

        if (sounds.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center p-8">No sounds uploaded yet</p>';
            return;
        }

        container.innerHTML = sounds.map(sound => `
            <div class="card p-4">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="font-semibold">${sound.description || sound.originalName || sound.filename}</h4>
                    <span class="text-sm text-gray-400">${sound.category || 'General'}</span>
                </div>
                <div class="flex gap-2">
                    <button class="btn btn-primary btn-sm" onclick="app.playSound('${sound.filename}')">
                        <i class="fas fa-play"></i> Play
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="app.deleteSound('${sound.filename}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    updateStatsDisplay(stats) {
        const totalPenalties = document.getElementById('totalPenalties');
        const micPenalties = document.getElementById('micPenalties');
        const chatPenalties = document.getElementById('chatPenalties');
        const uniqueUsers = document.getElementById('uniqueUsers');

        if (totalPenalties && stats.penalties) {
            totalPenalties.textContent = stats.penalties.total || 0;
        }
        if (micPenalties && stats.penalties) {
            micPenalties.textContent = stats.penalties.mic || 0;
        }
        if (chatPenalties && stats.penalties) {
            chatPenalties.textContent = stats.penalties.chat || 0;
        }
        if (uniqueUsers && stats.users) {
            uniqueUsers.textContent = stats.users.length || 0;
        }

        // Update top users table
        this.updateTopUsersTable(stats.users || []);
    }

    updateTopUsersTable(users) {
        const tbody = document.getElementById('topUsersTable');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-8">No user data available</td></tr>';
            return;
        }

        tbody.innerHTML = users.slice(0, 10).map((user, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${user.username || user.user || 'Unknown'}</td>
                <td>${user.count || user.penalties || 0}</td>
                <td>${this.formatDate(user.last_penalty || user.lastPenalty)}</td>
            </tr>
        `).join('');
    }

    addRecentActivity(penalty) {
        const container = document.getElementById('recentPenalties');
        if (!container) return;

        const activityHtml = `
            <div class="card p-3 mb-2">
                <div class="flex items-center gap-3">
                    <i class="fas fa-exclamation-triangle text-warning"></i>
                    <div>
                        <div class="font-medium">${penalty.source === 'mic' ? 'Microphone' : 'Chat'} Penalty</div>
                        <div class="text-sm text-gray-400">
                            Word: "${penalty.word}" - ${new Date(penalty.timestamp).toLocaleTimeString()}
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('afterbegin', activityHtml);

        // Keep only last 10 activities
        const activities = container.children;
        while (activities.length > 10) {
            container.removeChild(activities[activities.length - 1]);
        }
    }

    // API Methods
    async addCustomWord() {
        const input = document.getElementById('newWord');
        const word = input.value.trim().toLowerCase();

        if (!word) {
            this.showNotification('Please enter a word', 'error');
            return;
        }

        try {
            const response = await fetch('/api/add-word', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ word })
            });

            if (response.ok) {
                input.value = '';
                this.showNotification('Word added successfully', 'success');
                await this.loadWords();
            } else {
                const error = await response.json();
                this.showNotification(error.error || 'Failed to add word', 'error');
            }
        } catch (error) {
            console.error('Error adding word:', error);
            this.showNotification('Failed to add word', 'error');
        }
    }

    async removeCustomWord(word) {
        if (!confirm(`Remove "${word}" from custom words?`)) return;

        try {
            const response = await fetch(`/api/remove-word/${encodeURIComponent(word)}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showNotification('Word removed successfully', 'success');
                await this.loadWords();
            } else {
                this.showNotification('Failed to remove word', 'error');
            }
        } catch (error) {
            console.error('Error removing word:', error);
            this.showNotification('Failed to remove word', 'error');
        }
    }

    async uploadSound() {
        const fileInput = document.getElementById('soundFile');
        const file = fileInput.files[0];

        if (!file) {
            this.showNotification('Please select a sound file', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('soundFile', file);
        formData.append('category', 'penalty');
        formData.append('description', file.name);

        try {
            const response = await fetch('/api/sounds/upload', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                fileInput.value = '';
                this.showNotification('Sound uploaded successfully', 'success');
                await this.loadSounds();
            } else {
                this.showNotification('Failed to upload sound', 'error');
            }
        } catch (error) {
            console.error('Error uploading sound:', error);
            this.showNotification('Failed to upload sound', 'error');
        }
    }

    async playSound(filename) {
        try {
            const volume = document.getElementById('masterVolume')?.value || 0.5;
            const response = await fetch('/api/sounds/play', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, volume: parseFloat(volume) })
            });

            if (response.ok) {
                this.showNotification('Sound played', 'info', 2000);
            } else {
                this.showNotification('Failed to play sound', 'error');
            }
        } catch (error) {
            console.error('Error playing sound:', error);
            this.showNotification('Failed to play sound', 'error');
        }
    }

    async deleteSound(filename) {
        if (!confirm('Delete this sound file?')) return;

        try {
            const response = await fetch(`/api/sounds/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showNotification('Sound deleted successfully', 'success');
                await this.loadSounds();
            } else {
                this.showNotification('Failed to delete sound', 'error');
            }
        } catch (error) {
            console.error('Error deleting sound:', error);
            this.showNotification('Failed to delete sound', 'error');
        }
    }

    // Control Methods
    startListening() {
        if (this.socket) {
            this.socket.emit('startListening');
            this.showNotification('Started listening', 'success', 2000);
        }
    }

    stopListening() {
        if (this.socket) {
            this.socket.emit('stopListening');
            this.showNotification('Stopped listening', 'info', 2000);
        }
    }

    async resetCounter() {
        if (!confirm('Are you sure you want to reset the penalty counter?')) return;

        try {
            const response = await fetch('/api/reset', { method: 'POST' });
            if (response.ok) {
                this.showNotification('Counter reset successfully', 'success');
                await this.loadCount();
            } else {
                this.showNotification('Failed to reset counter', 'error');
            }
        } catch (error) {
            console.error('Error resetting counter:', error);
            this.showNotification('Failed to reset counter', 'error');
        }
    }

    // Chat Methods
    async connectChat() {
        const channel = document.getElementById('chatChannel').value.trim();
        const username = document.getElementById('chatUsername').value.trim();
        const oauth = document.getElementById('chatOAuth').value.trim();

        if (!channel) {
            this.showChatError('Channel name is required');
            return;
        }

        this.hideChatError();

        try {
            const response = await fetch('/api/chat/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel, username, oauth })
            });

            const result = await response.json();

            if (response.ok) {
                this.showNotification('Connected to chat successfully', 'success');
                this.hideChatError();
                this.updateChatStatusUI(true, 'Connected');
            } else {
                this.showChatError(result.error || 'Failed to connect to chat');
                this.updateChatStatusUI(false, 'Connection Failed');
            }
        } catch (error) {
            console.error('Error connecting to chat:', error);
            this.showChatError('Network error - check your connection');
            this.updateChatStatusUI(false, 'Connection Failed');
        }
    }

    async disconnectChat() {
        try {
            const response = await fetch('/api/chat/disconnect', { method: 'POST' });
            if (response.ok) {
                this.showNotification('Disconnected from chat', 'success');
                this.hideChatError();
                this.updateChatStatusUI(false, 'Disconnected');
            } else {
                this.showNotification('Failed to disconnect from chat', 'error');
                this.updateChatStatusUI(false, 'Disconnected');
            }
        } catch (error) {
            console.error('Error disconnecting from chat:', error);
            this.showNotification('Failed to disconnect from chat', 'error');
        }
    }

    async updateChatStatus() {
        try {
            const response = await fetch('/api/chat/status');
            const data = await response.json();
            const connected = data.data?.connected || false;
            this.updateChatStatusUI(connected, connected ? 'Connected' : 'Disconnected');

            // Legacy element support
            const statusElement = document.getElementById('chatConnectionStatus');
            if (statusElement) {
                statusElement.textContent = connected ? 'Connected' : 'Disconnected';
            }
        } catch (error) {
            console.error('Error getting chat status:', error);
            this.updateChatStatusUI(false, 'Error');
        }
    }

    updateChatStatusUI(connected, statusText) {
        const statusIndicator = document.getElementById('chatStatus');
        const statusTextElement = document.getElementById('chatStatusText');

        if (statusIndicator) {
            statusIndicator.className = connected
                ? 'status-indicator status-connected'
                : 'status-indicator status-disconnected';
        }

        if (statusTextElement) {
            statusTextElement.textContent = statusText;
        }
    }

    showChatError(message) {
        const errorElement = document.getElementById('chatError');
        const errorMessageElement = document.getElementById('chatErrorMessage');

        if (errorElement && errorMessageElement) {
            errorMessageElement.textContent = message;
            errorElement.classList.remove('hidden');
        }
    }

    hideChatError() {
        const errorElement = document.getElementById('chatError');
        if (errorElement) {
            errorElement.classList.add('hidden');
        }
    }

    // Settings Methods
    async saveThresholds() {
        const warning = {
            count: parseInt(document.getElementById('warningThreshold').value),
            color: document.getElementById('warningColor').value
        };
        const danger = {
            count: parseInt(document.getElementById('dangerThreshold').value),
            color: document.getElementById('dangerColor').value
        };

        try {
            const response = await fetch('/api/thresholds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ warning, danger })
            });

            if (response.ok) {
                this.showNotification('Thresholds saved successfully', 'success');
            } else {
                this.showNotification('Failed to save thresholds', 'error');
            }
        } catch (error) {
            console.error('Error saving thresholds:', error);
            this.showNotification('Failed to save thresholds', 'error');
        }
    }

    async saveAutoReset() {
        const enabled = document.getElementById('autoResetEnabled').checked;
        const duration = parseInt(document.getElementById('autoResetDuration').value);

        try {
            const response = await fetch('/api/auto-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled, duration })
            });

            if (response.ok) {
                this.showNotification('Auto-reset settings saved', 'success');
            } else {
                this.showNotification('Failed to save auto-reset settings', 'error');
            }
        } catch (error) {
            console.error('Error saving auto-reset settings:', error);
            this.showNotification('Failed to save auto-reset settings', 'error');
        }
    }

    async saveSoundSettings() {
        const volume = parseFloat(document.getElementById('masterVolume').value);

        try {
            const response = await fetch('/api/sound-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: true, volume })
            });

            if (response.ok) {
                this.showNotification('Sound settings saved', 'success');
            } else {
                this.showNotification('Failed to save sound settings', 'error');
            }
        } catch (error) {
            console.error('Error saving sound settings:', error);
            this.showNotification('Failed to save sound settings', 'error');
        }
    }

    async exportData() {
        try {
            const response = await fetch('/api/export');
            const data = await response.json();

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json'
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `sinbin-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            this.showNotification('Data exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting data:', error);
            this.showNotification('Failed to export data', 'error');
        }
    }

    async resetAll() {
        if (!confirm('Are you sure you want to reset ALL data? This cannot be undone!')) return;
        if (!confirm('This will delete all sessions, penalties, and user data. Are you absolutely sure?')) return;

        try {
            const response = await fetch('/api/reset-all', { method: 'POST' });
            if (response.ok) {
                this.showNotification('All data reset successfully', 'success');
                setTimeout(() => location.reload(), 2000);
            } else {
                this.showNotification('Failed to reset all data', 'error');
            }
        } catch (error) {
            console.error('Error resetting all data:', error);
            this.showNotification('Failed to reset all data', 'error');
        }
    }

    // Overlay Styling Methods
    loadOverlayStyles() {
        // Load saved overlay styles from localStorage
        const defaultStyles = {
            layout: 'vertical',
            transcriptPosition: 'below',
            showBackground: true,
            showStatus: true,
            showTranscript: true,
            backgroundColor: '#000000',
            backgroundAlpha: 0.8,
            backgroundGradient: 'none',
            backgroundGradientColor: '#333333',
            gradientDirection: 180,
            binColor: '#ffffff',
            binAlpha: 1,
            binSize: 80,
            binShadow: 0.5,
            counterColor: '#000000',
            counterAlpha: 1,
            counterShadow: 0.3,
            statusConnectedColor: '#10b981',
            statusListeningColor: '#f59e0b',
            statusDisconnectedColor: '#ef4444',
            statusSize: 12,
            statusAlpha: 1,
            transcriptColor: '#ffffff',
            transcriptAlpha: 0.9,
            transcriptWeight: '500',
            warningColor: '#f59e0b',
            dangerColor: '#ef4444'
        };

        // Load from localStorage or use defaults
        Object.keys(defaultStyles).forEach(key => {
            const saved = localStorage.getItem(`overlay_${key}`);
            const value = saved !== null ? (saved === 'true' ? true : saved === 'false' ? false : saved) : defaultStyles[key];
            this.setOverlayControl(key, value);
        });

        this.setupOverlayEventListeners();
        this.updateMiniPreview();
    }

    setOverlayControl(key, value) {
        const element = document.getElementById(key);
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = value;
            } else if (element.type === 'range') {
                element.value = value;
                // Update display value
                const displayElement = document.getElementById(key + 'Value');
                if (displayElement) {
                    if (key.includes('Alpha')) {
                        displayElement.textContent = Math.round(value * 100) + '%';
                    } else if (key.includes('Size')) {
                        displayElement.textContent = value + 'px';
                    } else if (key.includes('Shadow')) {
                        displayElement.textContent = Math.round(value * 100) + '%';
                    }
                }
            } else {
                element.value = value;
            }

            // Also update hex input if it exists
            const hexElement = document.getElementById(key + 'Hex');
            if (hexElement && typeof value === 'string' && value.startsWith('#')) {
                hexElement.value = value;
            }
        }
    }

    setupOverlayEventListeners() {
        // Color picker and hex input sync
        ['backgroundColor', 'binColor', 'counterColor', 'transcriptColor', 'warningColor', 'dangerColor'].forEach(colorId => {
            const colorPicker = document.getElementById(colorId);
            const hexInput = document.getElementById(colorId + 'Hex');

            if (colorPicker && hexInput) {
                colorPicker.addEventListener('input', () => {
                    hexInput.value = colorPicker.value;
                    this.updateMiniPreview();
                });

                hexInput.addEventListener('input', () => {
                    if (this.isValidHex(hexInput.value)) {
                        colorPicker.value = hexInput.value;
                        this.updateMiniPreview();
                    }
                });
            }
        });

        // Range sliders with value display
        ['backgroundAlpha', 'binAlpha', 'binSize', 'binShadow', 'counterAlpha', 'counterShadow', 'statusSize', 'statusAlpha', 'transcriptAlpha', 'gradientDirection'].forEach(rangeId => {
            const range = document.getElementById(rangeId);
            const valueDisplay = document.getElementById(rangeId + 'Value');

            if (range && valueDisplay) {
                range.addEventListener('input', () => {
                    const value = parseFloat(range.value);
                    if (rangeId.includes('Alpha') || rangeId.includes('Shadow')) {
                        valueDisplay.textContent = Math.round(value * 100) + '%';
                    } else if (rangeId.includes('Size')) {
                        valueDisplay.textContent = value + 'px';
                    } else if (rangeId === 'gradientDirection') {
                        valueDisplay.textContent = value + '°';
                    }
                    this.updateMiniPreview();
                });
            }
        });

        // Gradient controls
        const gradientSelect = document.getElementById('backgroundGradient');
        const gradientControls = document.getElementById('gradientControls');

        if (gradientSelect && gradientControls) {
            gradientSelect.addEventListener('change', () => {
                gradientControls.classList.toggle('hidden', gradientSelect.value === 'none');
                this.updateMiniPreview();
            });
        }

        // Checkbox listeners
        ['showBackground', 'showStatus', 'showTranscript', 'enableThresholds'].forEach(checkboxId => {
            const checkbox = document.getElementById(checkboxId);
            if (checkbox) {
                checkbox.addEventListener('change', () => this.updateMiniPreview());
            }
        });

        // Select listeners
        ['overlayLayout', 'transcriptPosition', 'transcriptWeight'].forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                select.addEventListener('change', () => this.updateMiniPreview());
            }
        });
    }

    updateMiniPreview() {
        const preview = document.getElementById('miniPreview');
        if (!preview) return;

        const bgColor = document.getElementById('backgroundColor').value;
        const bgAlpha = document.getElementById('backgroundAlpha').value;
        const binColor = document.getElementById('binColor').value;
        const binSize = document.getElementById('binSize').value;
        const statusConnected = document.getElementById('statusConnectedColor').value;
        const transcriptColor = document.getElementById('transcriptColor').value;
        const layout = document.getElementById('overlayLayout').value;

        // Update preview layout
        preview.className = layout === 'horizontal'
            ? 'flex items-center gap-3 scale-50 transform-origin-center'
            : 'flex flex-col items-center gap-2 scale-50 transform-origin-center';

        // Update background if enabled
        const showBg = document.getElementById('showBackground').checked;
        preview.parentElement.style.background = showBg
            ? `${bgColor}${Math.round(bgAlpha * 255).toString(16).padStart(2, '0')}`
            : 'transparent';

        // Update bin color and size
        const binContainer = preview.querySelector('.w-16.h-16');
        const binSvg = preview.querySelector('svg');
        if (binContainer && binSvg) {
            // Scale the bin container based on bin size (mapping 40-150 to appropriate preview scale)
            const scale = (binSize - 40) / (150 - 40) * 0.5 + 0.75; // Maps 40-150 to 0.75-1.25 scale
            binContainer.style.transform = `scale(${scale})`;
            binSvg.style.color = binColor;
        }

        // Update status color
        const statusDot = preview.querySelector('.w-3.h-3');
        if (statusDot) {
            statusDot.style.backgroundColor = statusConnected;
            statusDot.style.display = document.getElementById('showStatus').checked ? 'block' : 'none';
        }

        // Update transcript color and visibility
        const transcriptText = preview.querySelector('.text-white');
        if (transcriptText) {
            transcriptText.style.color = transcriptColor;
            transcriptText.style.display = document.getElementById('showTranscript').checked ? 'block' : 'none';
        }

        // AUTO-APPLY: Also apply settings to the actual overlay in real-time (silently)
        this.applyOverlayStyles(false);
    }

    async applyOverlayStyles(showNotification = true) {
        const styles = this.getOverlayStyles();

        try {
            // Save to localStorage
            Object.keys(styles).forEach(key => {
                localStorage.setItem(`overlay_${key}`, styles[key]);
            });

            // Map control panel properties to overlay properties
            const overlayOptions = {
                layout: styles.layout,
                transcriptPosition: styles.transcriptPosition,
                showBackground: styles.showBackground === true || styles.showBackground === 'true',
                showStatus: styles.showStatus === true || styles.showStatus === 'true',
                showTranscript: styles.showTranscript === true || styles.showTranscript === 'true',
                backgroundColor: styles.backgroundColor,
                backgroundAlpha: parseFloat(styles.backgroundAlpha) || 0.8,
                binColor: styles.binColor,
                binAlpha: parseFloat(styles.binAlpha) || 1.0,
                binSize: parseInt(styles.binSize) || 120,
                counterColor: styles.counterColor,
                counterAlpha: parseFloat(styles.counterAlpha) || 1.0,
                statusColor: styles.statusConnectedColor, // Default status color
                statusAlpha: parseFloat(styles.statusAlpha) || 1.0,
                transcriptColor: styles.transcriptColor,
                transcriptAlpha: parseFloat(styles.transcriptAlpha) || 1.0,
                warningColor: styles.warningColor,
                dangerColor: styles.dangerColor,
                warningThreshold: parseInt(styles.warningThreshold) || 5,
                dangerThreshold: parseInt(styles.dangerThreshold) || 10,
                enableThresholds: styles.enableThresholds === true || styles.enableThresholds === 'true'
            };

            // Send to overlay via WebSocket
            if (this.socket) {
                this.socket.emit('displayOptionsUpdate', overlayOptions);
                console.log('Sending overlay options:', overlayOptions);
                console.log('Background settings - color:', overlayOptions.backgroundColor, 'alpha:', overlayOptions.backgroundAlpha);
                console.log('Threshold settings - enableThresholds:', overlayOptions.enableThresholds, 'type:', typeof overlayOptions.enableThresholds);
            }

            // Also save to overlay localStorage directly (for when overlay loads)
            // Map to the specific keys the overlay expects
            const overlayStorageMapping = {
                layout: 'layoutMode',
                transcriptPosition: 'transcriptPosition',
                showBackground: 'showBackground',
                backgroundColor: 'backgroundColor',
                backgroundAlpha: 'backgroundAlpha',
                showStatus: 'showStatus',
                statusColor: 'statusColor',
                statusAlpha: 'statusAlpha',
                binColor: 'binColor',
                binAlpha: 'binAlpha',
                binSize: 'binSize',
                counterColor: 'counterColor',
                counterAlpha: 'counterAlpha',
                showTranscript: 'showTranscript',
                transcriptColor: 'transcriptColor',
                transcriptAlpha: 'transcriptAlpha',
                warningColor: 'warningColor',
                dangerColor: 'dangerColor',
                warningThreshold: 'warningThreshold',
                dangerThreshold: 'dangerThreshold',
                enableThresholds: 'enableThresholds'
            };

            Object.keys(overlayOptions).forEach(key => {
                const storageKey = overlayStorageMapping[key] || key;
                localStorage.setItem(storageKey, overlayOptions[key]);
            });

            if (showNotification) {
                this.showNotification('Overlay styles applied successfully', 'success');
            }
        } catch (error) {
            console.error('Error applying overlay styles:', error);
            if (showNotification) {
                this.showNotification('Failed to apply overlay styles', 'error');
            }
        }
    }

    getOverlayStyles() {
        const getValue = (id) => {
            const element = document.getElementById(id);
            if (!element) return null;

            if (element.type === 'checkbox') return element.checked;
            if (element.type === 'range') return parseFloat(element.value);
            return element.value;
        };

        return {
            layout: getValue('overlayLayout'),
            transcriptPosition: getValue('transcriptPosition'),
            showBackground: getValue('showBackground'),
            showStatus: getValue('showStatus'),
            showTranscript: getValue('showTranscript'),
            backgroundColor: getValue('backgroundColor'),
            backgroundAlpha: getValue('backgroundAlpha'),
            backgroundGradient: getValue('backgroundGradient'),
            backgroundGradientColor: getValue('backgroundGradientColor'),
            gradientDirection: getValue('gradientDirection'),
            binColor: getValue('binColor'),
            binAlpha: getValue('binAlpha'),
            binSize: getValue('binSize'),
            binShadow: getValue('binShadow'),
            counterColor: getValue('counterColor'),
            counterAlpha: getValue('counterAlpha'),
            counterShadow: getValue('counterShadow'),
            statusConnectedColor: getValue('statusConnectedColor'),
            statusListeningColor: getValue('statusListeningColor'),
            statusDisconnectedColor: getValue('statusDisconnectedColor'),
            statusSize: getValue('statusSize'),
            statusAlpha: getValue('statusAlpha'),
            transcriptColor: getValue('transcriptColor'),
            transcriptAlpha: getValue('transcriptAlpha'),
            transcriptWeight: getValue('transcriptWeight'),
            warningColor: getValue('warningColor'),
            dangerColor: getValue('dangerColor'),
            warningThreshold: getValue('warningThreshold'),
            dangerThreshold: getValue('dangerThreshold'),
            enableThresholds: getValue('enableThresholds')
        };
    }

    resetOverlayStyles() {
        if (!confirm('Reset all overlay styles to defaults?')) return;

        // Clear localStorage
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('overlay_')) {
                localStorage.removeItem(key);
            }
        });

        // Reload styles
        this.loadOverlayStyles();
        this.showNotification('Overlay styles reset to defaults', 'success');
    }

    exportOverlayTheme() {
        const styles = this.getOverlayStyles();
        const theme = {
            name: 'SinBin Overlay Theme',
            version: '1.0',
            created: new Date().toISOString(),
            styles: styles
        };

        const blob = new Blob([JSON.stringify(theme, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `sinbin-overlay-theme-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this.showNotification('Theme exported successfully', 'success');
    }

    importOverlayTheme() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const theme = JSON.parse(e.target.result);
                    if (theme.styles) {
                        Object.keys(theme.styles).forEach(key => {
                            this.setOverlayControl(key, theme.styles[key]);
                            localStorage.setItem(`overlay_${key}`, theme.styles[key]);
                        });
                        this.updateMiniPreview();
                        this.showNotification('Theme imported successfully', 'success');
                    } else {
                        throw new Error('Invalid theme file format');
                    }
                } catch (error) {
                    console.error('Error importing theme:', error);
                    this.showNotification('Failed to import theme', 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    previewOverlay() {
        window.open('/overlay.html', 'overlay_preview', 'width=800,height=600');
    }

    isValidHex(hex) {
        return /^#([0-9A-F]{3}){1,2}$/i.test(hex);
    }

    // Utility Methods
    showNotification(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }

    formatDate(dateString) {
        if (!dateString) return 'Never';
        return new Date(dateString).toLocaleString();
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.toggle('open');
        }
    }

    toggleTheme() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        // Update HTML attribute
        html.setAttribute('data-theme', newTheme);

        // Update button text and icon
        const themeIcon = document.getElementById('themeIcon');
        const themeText = document.getElementById('themeText');

        if (newTheme === 'light') {
            themeIcon.className = 'fas fa-sun';
            themeText.textContent = 'Dark Mode';
        } else {
            themeIcon.className = 'fas fa-moon';
            themeText.textContent = 'Light Mode';
        }

        // Save preference
        localStorage.setItem('theme', newTheme);

        this.showNotification(`Switched to ${newTheme} mode`, 'success');
    }

    initTheme() {
        // Load saved theme or default to dark
        const savedTheme = localStorage.getItem('theme') || 'dark';
        const html = document.documentElement;
        html.setAttribute('data-theme', savedTheme);

        // Update button text and icon based on current theme
        const themeIcon = document.getElementById('themeIcon');
        const themeText = document.getElementById('themeText');

        if (savedTheme === 'light') {
            themeIcon.className = 'fas fa-sun';
            themeText.textContent = 'Dark Mode';
        } else {
            themeIcon.className = 'fas fa-moon';
            themeText.textContent = 'Light Mode';
        }
    }
}

// Global Functions for onclick handlers
function showTab(tabName) {
    if (window.app) {
        window.app.showTab(tabName);
    }
}

function startListening() {
    if (window.app) {
        window.app.startListening();
    }
}

function stopListening() {
    if (window.app) {
        window.app.stopListening();
    }
}

function resetCounter() {
    if (window.app) {
        window.app.resetCounter();
    }
}

function addCustomWord() {
    if (window.app) {
        window.app.addCustomWord();
    }
}

function connectChat() {
    if (window.app) {
        window.app.connectChat();
    }
}

function disconnectChat() {
    if (window.app) {
        window.app.disconnectChat();
    }
}

function uploadSound() {
    if (window.app) {
        window.app.uploadSound();
    }
}

function saveThresholds() {
    if (window.app) {
        window.app.saveThresholds();
    }
}

function saveAutoReset() {
    if (window.app) {
        window.app.saveAutoReset();
    }
}

function saveSoundSettings() {
    if (window.app) {
        window.app.saveSoundSettings();
    }
}

function exportData() {
    if (window.app) {
        window.app.exportData();
    }
}

function resetAll() {
    if (window.app) {
        window.app.resetAll();
    }
}

function toggleSidebar() {
    if (window.app) {
        window.app.toggleSidebar();
    }
}

function toggleTheme() {
    if (window.app) {
        window.app.toggleTheme();
    }
}

// Overlay styling functions
function applyOverlayStyles() {
    if (window.app) {
        window.app.applyOverlayStyles();
    }
}

function resetOverlayStyles() {
    if (window.app) {
        window.app.resetOverlayStyles();
    }
}

function exportOverlayTheme() {
    if (window.app) {
        window.app.exportOverlayTheme();
    }
}

function importOverlayTheme() {
    if (window.app) {
        window.app.importOverlayTheme();
    }
}

function previewOverlay() {
    if (window.app) {
        window.app.previewOverlay();
    }
}

// Word Management Functions
function showPredefinedWords() {
    document.getElementById('predefinedWordsContainer').classList.remove('hidden');
    document.getElementById('showPredefinedWordsBtn').classList.add('hidden');
}

function hidePredefinedWords() {
    document.getElementById('predefinedWordsContainer').classList.add('hidden');
    document.getElementById('predefinedWordsList').classList.add('hidden');
    document.getElementById('showPredefinedWordsBtn').innerHTML = '<i class="fas fa-eye"></i> Show Words';
    document.getElementById('showPredefinedWordsBtn').setAttribute('onclick', 'showPredefinedWords()');
    document.getElementById('showPredefinedWordsBtn').classList.remove('hidden');
}

function confirmShowPredefinedWords() {
    document.getElementById('predefinedWordsContainer').classList.add('hidden');
    document.getElementById('predefinedWordsList').classList.remove('hidden');
    document.getElementById('showPredefinedWordsBtn').innerHTML = '<i class="fas fa-eye-slash"></i> Hide Words';
    document.getElementById('showPredefinedWordsBtn').setAttribute('onclick', 'hidePredefinedWords()');
    document.getElementById('showPredefinedWordsBtn').classList.remove('hidden');
}

function showCustomWords() {
    document.getElementById('customWordsContainer').classList.remove('hidden');
    document.getElementById('showCustomWordsBtn').classList.add('hidden');
}

function hideCustomWords() {
    document.getElementById('customWordsContainer').classList.add('hidden');
    document.getElementById('customWordsList').classList.add('hidden');
    document.getElementById('showCustomWordsBtn').innerHTML = '<i class="fas fa-eye"></i> Show Words';
    document.getElementById('showCustomWordsBtn').setAttribute('onclick', 'showCustomWords()');
    document.getElementById('showCustomWordsBtn').classList.remove('hidden');
}

function confirmShowCustomWords() {
    document.getElementById('customWordsContainer').classList.add('hidden');
    document.getElementById('customWordsList').classList.remove('hidden');
    document.getElementById('showCustomWordsBtn').innerHTML = '<i class="fas fa-eye-slash"></i> Hide Words';
    document.getElementById('showCustomWordsBtn').setAttribute('onclick', 'hideCustomWords()');
    document.getElementById('showCustomWordsBtn').classList.remove('hidden');
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SinBinApp();
});