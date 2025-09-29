import sqlite3 from 'sqlite3'
import * as fs from 'fs'
import * as path from 'path'

export interface PenaltyRecord {
    id?: number
    word: string
    source: 'mic' | 'chat'
    username?: string
    confidence?: number
    session_id?: number
    timestamp?: string
}

export interface UserRecord {
    username: string
    penalty_count: number
    first_seen: string
    last_penalty?: string
    total_messages: number
}

export interface SessionRecord {
    id?: number
    start_time: string
    end_time?: string
    total_penalties: number
    mic_penalties: number
    chat_penalties: number
    clean_streak_best: number
    active: boolean
}

export interface ThresholdRecord {
    id?: number
    name: string
    count: number
    color: string
    sound_file?: string
    active: boolean
}

export interface GoalRecord {
    id?: number
    type: 'daily' | 'session' | 'weekly'
    target_count: number
    target_type: 'under' | 'exact' | 'over'
    start_date?: string
    end_date?: string
    achieved: boolean
    created_at: string
}

export class Database {
    private db: sqlite3.Database
    private dbPath: string

    constructor(dbPath: string = './sinbin.db') {
        this.dbPath = dbPath

        // Enable verbose mode for debugging
        sqlite3.verbose()

        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message)
                throw err
            }
            console.log('Connected to SQLite database at:', dbPath)
        })

        // Enable foreign keys
        this.db.run('PRAGMA foreign_keys = ON')
    }

    async initialize(): Promise<void> {
        return new Promise((resolve, reject) => {
            const schemaPath = path.join(__dirname, 'schema.sql')
            const schema = fs.readFileSync(schemaPath, 'utf8')

            this.db.exec(schema, (err) => {
                if (err) {
                    console.error('Error initializing database schema:', err.message)
                    reject(err)
                } else {
                    console.log('Database schema initialized successfully')
                    resolve()
                }
            })
        })
    }

    // Penalty methods
    async addPenalty(penalty: PenaltyRecord): Promise<number> {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO penalties (word, source, username, confidence, session_id)
                VALUES (?, ?, ?, ?, ?)
            `

            this.db.run(sql, [
                penalty.word,
                penalty.source,
                penalty.username || null,
                penalty.confidence || null,
                penalty.session_id || null
            ], function(err) {
                if (err) {
                    reject(err)
                } else {
                    resolve(this.lastID)
                }
            })
        })
    }

    async getPenalties(limit: number = 100, source?: 'mic' | 'chat'): Promise<PenaltyRecord[]> {
        return new Promise((resolve, reject) => {
            let sql = 'SELECT * FROM penalties'
            const params: any[] = []

            if (source) {
                sql += ' WHERE source = ?'
                params.push(source)
            }

            sql += ' ORDER BY timestamp DESC LIMIT ?'
            params.push(limit)

            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(rows as PenaltyRecord[])
                }
            })
        })
    }

    async getPenaltyCount(source?: 'mic' | 'chat', sessionId?: number): Promise<number> {
        return new Promise((resolve, reject) => {
            let sql = 'SELECT COUNT(*) as count FROM penalties WHERE 1=1'
            const params: any[] = []

            if (source) {
                sql += ' AND source = ?'
                params.push(source)
            }

            if (sessionId) {
                sql += ' AND session_id = ?'
                params.push(sessionId)
            }

            this.db.get(sql, params, (err, row: any) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(row.count)
                }
            })
        })
    }

    // Session methods
    async createSession(): Promise<number> {
        return new Promise((resolve, reject) => {
            const sql = 'INSERT INTO sessions (start_time) VALUES (datetime("now"))'

            this.db.run(sql, function(err) {
                if (err) {
                    reject(err)
                } else {
                    resolve(this.lastID)
                }
            })
        })
    }

    async getActiveSession(): Promise<SessionRecord | null> {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM sessions WHERE active = 1 ORDER BY start_time DESC LIMIT 1'

            this.db.get(sql, (err, row) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(row as SessionRecord || null)
                }
            })
        })
    }

    async updateSession(sessionId: number, updates: Partial<SessionRecord>): Promise<void> {
        return new Promise((resolve, reject) => {
            const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ')
            const values = Object.values(updates)

            const sql = `UPDATE sessions SET ${fields} WHERE id = ?`

            this.db.run(sql, [...values, sessionId], (err) => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            })
        })
    }

    // User methods (for chat)
    async addOrUpdateUser(username: string, penaltyIncrement: number = 0): Promise<void> {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO users (username, penalty_count, total_messages, last_penalty)
                VALUES (?, ?, 1, datetime("now"))
                ON CONFLICT(username) DO UPDATE SET
                penalty_count = penalty_count + ?,
                total_messages = total_messages + 1,
                last_penalty = CASE WHEN ? > 0 THEN datetime("now") ELSE last_penalty END
            `

            this.db.run(sql, [username, penaltyIncrement, penaltyIncrement, penaltyIncrement], (err) => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            })
        })
    }

    async getTopUsers(limit: number = 10): Promise<UserRecord[]> {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM users
                WHERE penalty_count > 0
                ORDER BY penalty_count DESC
                LIMIT ?
            `

            this.db.all(sql, [limit], (err, rows) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(rows as UserRecord[])
                }
            })
        })
    }

    async getUser(username: string): Promise<UserRecord | null> {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM users WHERE username = ?'

            this.db.get(sql, [username], (err, row: any) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(row ? row as UserRecord : null)
                }
            })
        })
    }

    // Settings methods
    async getSetting(key: string): Promise<string | null> {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT value FROM settings WHERE key = ?'

            this.db.get(sql, [key], (err, row: any) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(row ? row.value : null)
                }
            })
        })
    }

    async setSetting(key: string, value: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO settings (key, value, updated_at)
                VALUES (?, ?, datetime("now"))
                ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            `

            this.db.run(sql, [key, value], (err) => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            })
        })
    }

    // Threshold methods
    async getThresholds(): Promise<ThresholdRecord[]> {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM thresholds WHERE active = 1 ORDER BY count ASC'

            this.db.all(sql, (err, rows) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(rows as ThresholdRecord[])
                }
            })
        })
    }

    async updateThreshold(id: number, updates: Partial<ThresholdRecord>): Promise<void> {
        return new Promise((resolve, reject) => {
            const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ')
            const values = Object.values(updates)

            const sql = `UPDATE thresholds SET ${fields} WHERE id = ?`

            this.db.run(sql, [...values, id], (err) => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            })
        })
    }

    // Migration from JSON config
    async migrateFromJSON(jsonConfig: any): Promise<void> {
        console.log('Migrating from JSON config to database...')

        // Migrate penalty count as a single session if > 0
        if (jsonConfig.swearCount > 0) {
            const sessionId = await this.createSession()

            // Create penalty records for the count (without specific words since we don't have that data)
            for (let i = 0; i < jsonConfig.swearCount; i++) {
                await this.addPenalty({
                    word: 'migrated',
                    source: 'mic',
                    session_id: sessionId
                })
            }

            await this.updateSession(sessionId, {
                total_penalties: jsonConfig.swearCount,
                mic_penalties: jsonConfig.swearCount,
                chat_penalties: 0
            })
        }

        // Migrate custom words to settings
        if (jsonConfig.customCurseWords && jsonConfig.customCurseWords.length > 0) {
            await this.setSetting('custom_curse_words', JSON.stringify(jsonConfig.customCurseWords))
        }

        console.log('Migration from JSON completed')
    }

    async close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    reject(err)
                } else {
                    console.log('Database connection closed')
                    resolve()
                }
            })
        })
    }

    // Utility method to reset all penalty counts
    async resetPenalties(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // End current session
                this.db.run('UPDATE sessions SET active = 0, end_time = datetime("now") WHERE active = 1')

                // Create new session
                this.db.run('INSERT INTO sessions (start_time) VALUES (datetime("now"))', function(err) {
                    if (err) {
                        reject(err)
                    } else {
                        resolve()
                    }
                })
            })
        })
    }
}