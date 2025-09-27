"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Database = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class Database {
    constructor(dbPath = './sinbin.db') {
        this.dbPath = dbPath;
        sqlite3_1.default.verbose();
        this.db = new sqlite3_1.default.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                throw err;
            }
            console.log('Connected to SQLite database at:', dbPath);
        });
        this.db.run('PRAGMA foreign_keys = ON');
    }
    async initialize() {
        return new Promise((resolve, reject) => {
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schema = fs.readFileSync(schemaPath, 'utf8');
            this.db.exec(schema, (err) => {
                if (err) {
                    console.error('Error initializing database schema:', err.message);
                    reject(err);
                }
                else {
                    console.log('Database schema initialized successfully');
                    resolve();
                }
            });
        });
    }
    async addPenalty(penalty) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO penalties (word, source, username, confidence, session_id)
                VALUES (?, ?, ?, ?, ?)
            `;
            this.db.run(sql, [
                penalty.word,
                penalty.source,
                penalty.username || null,
                penalty.confidence || null,
                penalty.session_id || null
            ], function (err) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(this.lastID);
                }
            });
        });
    }
    async getPenalties(limit = 100, source) {
        return new Promise((resolve, reject) => {
            let sql = 'SELECT * FROM penalties';
            const params = [];
            if (source) {
                sql += ' WHERE source = ?';
                params.push(source);
            }
            sql += ' ORDER BY timestamp DESC LIMIT ?';
            params.push(limit);
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    async getPenaltyCount(source, sessionId) {
        return new Promise((resolve, reject) => {
            let sql = 'SELECT COUNT(*) as count FROM penalties WHERE 1=1';
            const params = [];
            if (source) {
                sql += ' AND source = ?';
                params.push(source);
            }
            if (sessionId) {
                sql += ' AND session_id = ?';
                params.push(sessionId);
            }
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(row.count);
                }
            });
        });
    }
    async createSession() {
        return new Promise((resolve, reject) => {
            const sql = 'INSERT INTO sessions (start_time) VALUES (datetime("now"))';
            this.db.run(sql, function (err) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(this.lastID);
                }
            });
        });
    }
    async getActiveSession() {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM sessions WHERE active = 1 ORDER BY start_time DESC LIMIT 1';
            this.db.get(sql, (err, row) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(row || null);
                }
            });
        });
    }
    async updateSession(sessionId, updates) {
        return new Promise((resolve, reject) => {
            const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            const sql = `UPDATE sessions SET ${fields} WHERE id = ?`;
            this.db.run(sql, [...values, sessionId], (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async addOrUpdateUser(username, penaltyIncrement = 0) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO users (username, penalty_count, total_messages, last_penalty)
                VALUES (?, ?, 1, datetime("now"))
                ON CONFLICT(username) DO UPDATE SET
                penalty_count = penalty_count + ?,
                total_messages = total_messages + 1,
                last_penalty = CASE WHEN ? > 0 THEN datetime("now") ELSE last_penalty END
            `;
            this.db.run(sql, [username, penaltyIncrement, penaltyIncrement, penaltyIncrement], (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async getTopUsers(limit = 10) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM users
                WHERE penalty_count > 0
                ORDER BY penalty_count DESC
                LIMIT ?
            `;
            this.db.all(sql, [limit], (err, rows) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    async getSetting(key) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT value FROM settings WHERE key = ?';
            this.db.get(sql, [key], (err, row) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(row ? row.value : null);
                }
            });
        });
    }
    async setSetting(key, value) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO settings (key, value, updated_at)
                VALUES (?, ?, datetime("now"))
                ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            `;
            this.db.run(sql, [key, value], (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async getThresholds() {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM thresholds WHERE active = 1 ORDER BY count ASC';
            this.db.all(sql, (err, rows) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    async updateThreshold(id, updates) {
        return new Promise((resolve, reject) => {
            const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            const sql = `UPDATE thresholds SET ${fields} WHERE id = ?`;
            this.db.run(sql, [...values, id], (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async migrateFromJSON(jsonConfig) {
        console.log('Migrating from JSON config to database...');
        if (jsonConfig.swearCount > 0) {
            const sessionId = await this.createSession();
            for (let i = 0; i < jsonConfig.swearCount; i++) {
                await this.addPenalty({
                    word: 'migrated',
                    source: 'mic',
                    session_id: sessionId
                });
            }
            await this.updateSession(sessionId, {
                total_penalties: jsonConfig.swearCount,
                mic_penalties: jsonConfig.swearCount,
                chat_penalties: 0
            });
        }
        if (jsonConfig.customCurseWords && jsonConfig.customCurseWords.length > 0) {
            await this.setSetting('custom_curse_words', JSON.stringify(jsonConfig.customCurseWords));
        }
        console.log('Migration from JSON completed');
    }
    async close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    console.log('Database connection closed');
                    resolve();
                }
            });
        });
    }
    async resetPenalties() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('UPDATE sessions SET active = 0, end_time = datetime("now") WHERE active = 1');
                this.db.run('INSERT INTO sessions (start_time) VALUES (datetime("now"))', function (err) {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            });
        });
    }
}
exports.Database = Database;
//# sourceMappingURL=database.js.map