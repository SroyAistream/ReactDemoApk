/**
 * database_helper.native.ts
 *
 * SQLite-backed persistence for iOS + Android.
 * DB_VERSION = 2: adds content_type / video_type / theatrical_poster / preview
 *                  to movies; adds routers and profile tables.
 *
 * Migration strategy: ALTER TABLE ADD COLUMN wrapped in try/catch
 * (SQLite ignores duplicate columns, but throws — we swallow the error).
 */
import * as SQLite from 'expo-sqlite';
import { DB_NAME } from '../constants/api_constants';

const DB_VERSION = 2;
const DB_VERSION_KEY = '__db_version';

class DatabaseHelper {
  private db: SQLite.SQLiteDatabase | null = null;
  private async ensureDB() {
  if (!this.db) {
    console.log('[DB] Reconnecting to DB...');
    this.db = await SQLite.openDatabaseAsync(DB_NAME);
  }
}

  // ── Init ────────────────────────────────────────────────────────────────────

  async init() {
    try {
      this.db = await SQLite.openDatabaseAsync(DB_NAME);
      await this.createTables();
      await this.runMigrations();
      console.log('[DB] Initialized (v' + DB_VERSION + ')');
    } catch (error) {
      console.error('[DB] Init error:', error);
      throw error;
    }
  }

  private async createTables() {
    await this.ensureDB();

    // users
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE,
        password TEXT,
        token TEXT,
        token_expiry TEXT,
        device_id TEXT,
        plan_name TEXT,
        plan_expiry TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // movies — full schema including categorization fields
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_id TEXT UNIQUE,
        name TEXT,
        synopsis TEXT,
        rating REAL,
        poster_url TEXT,
        preview_url TEXT,
        theatrical_poster TEXT,
        preview TEXT,
        duration INTEGER,
        publish_date TEXT,
        release_date TEXT,
        country TEXT,
        star_score REAL,
        type TEXT,
        content_type INTEGER DEFAULT 0,
        video_type TEXT DEFAULT '{}',
        genres TEXT,
        genres_json TEXT,
        directors TEXT,
        actors TEXT,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // routers (AiStream hub list)
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS routers (
        id INTEGER PRIMARY KEY,
        uuid TEXT,
        name TEXT NOT NULL,
        mac TEXT,
        mac_5g TEXT,
        ssid TEXT,
        ssid5g TEXT,
        city TEXT,
        region TEXT,
        country TEXT,
        latitude REAL,
        longitude REAL,
        config TEXT,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // profile (single-row)
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY DEFAULT 1,
        user_id TEXT,
        username TEXT,
        plan_name TEXT,
        balance TEXT,
        available_downloads INTEGER,
        email TEXT,
        phone TEXT,
        raw_json TEXT,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // indexes
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_movies_movie_id ON movies(movie_id);
      CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
    `);
  }

  private async runMigrations() {
    await this.ensureDB();
    // Add any missing columns added in v2 (safe no-op if already present)
    const alterCmds = [
      'ALTER TABLE movies ADD COLUMN content_type INTEGER DEFAULT 0',
      'ALTER TABLE movies ADD COLUMN video_type TEXT DEFAULT \'{}\'',
      'ALTER TABLE movies ADD COLUMN theatrical_poster TEXT DEFAULT \'\'',
      'ALTER TABLE movies ADD COLUMN preview TEXT DEFAULT \'\'',
      'ALTER TABLE movies ADD COLUMN genres_json TEXT',
    ];
    for (const cmd of alterCmds) {
      try { await this.db.execAsync(cmd); } catch { /* column already exists */ }
    }
  }

  // ── Users ───────────────────────────────────────────────────────────────────

  async saveUser(userData: any) {
    await this.ensureDB();
    await this.db.runAsync(
      `INSERT OR REPLACE INTO users
       (user_id, password, token, token_expiry, device_id, plan_name, plan_expiry, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      userData.user_id, userData.password, userData.token, userData.token_expiry,
      userData.device_id, userData.plan_name || '', userData.plan_expiry || ''
    );
  }

  async getUser(deviceId: string) {
    if (!this.db) return null;
    return await this.db.getFirstAsync(
      'SELECT * FROM users WHERE device_id = ? LIMIT 1', deviceId
    );
  }

  async deleteUser(deviceId: string) {
    await this.ensureDB();
    await this.db.runAsync('DELETE FROM users WHERE device_id = ?', deviceId);
  }

  // ── Movies ──────────────────────────────────────────────────────────────────

  async saveMovies(movies: any[]) {
    await this.ensureDB();
    for (const movie of movies) {
      await this.db.runAsync(
        `INSERT OR REPLACE INTO movies
         (movie_id, name, synopsis, rating, poster_url, preview_url,
          theatrical_poster, preview, duration, publish_date, release_date,
          country, star_score, type, content_type, video_type,
          genres, genres_json, directors, actors, cached_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        String(movie.movie_id),
        movie.name,
        movie.synopsis || '',
        movie.rating || 0,
        movie.poster_url || '',
        movie.preview_url || '',
        movie.theatrical_poster || '',
        movie.preview || '',
        movie.duration || 0,
        movie.publish_date || '',
        movie.release_date || '',
        movie.country || '',
        movie.star_score || 0,
        String(movie.type || ''),
        movie.content_type || 0,
        typeof movie.video_type === 'object'
          ? JSON.stringify(movie.video_type || {})
          : (movie.video_type || '{}'),
        JSON.stringify(movie.genres || []),
        movie.genres_json || JSON.stringify(movie.genres || []),
        JSON.stringify(movie.directors || []),
        JSON.stringify(movie.actors || [])
      );
    }
  }

  async getMovies(limit = 200, offset = 0) {
    if (!this.db) return [];
    const results = await this.db.getAllAsync(
      'SELECT * FROM movies ORDER BY cached_at DESC LIMIT ? OFFSET ?',
      limit, offset
    ) as any[];
    return results.map((r) => ({
      ...r,
      genres:      this._parseJson(r.genres, []),
      genres_json: r.genres_json || r.genres,
      directors:   this._parseJson(r.directors, []),
      actors:      this._parseJson(r.actors, []),
      video_type:  this._parseJson(r.video_type, {}),
    }));
  }

  async searchMovies(query: string) {
    if (!this.db) return [];
    const q = `%${query}%`;
    const results = await this.db.getAllAsync(
      'SELECT * FROM movies WHERE name LIKE ? OR synopsis LIKE ? ORDER BY cached_at DESC',
      q, q
    ) as any[];
    return results.map((r) => ({
      ...r,
      genres:    this._parseJson(r.genres, []),
      directors: this._parseJson(r.directors, []),
      actors:    this._parseJson(r.actors, []),
      video_type: this._parseJson(r.video_type, {}),
    }));
  }

  async clearMovies() {
    await this.ensureDB();
    await this.db.runAsync('DELETE FROM movies');
  }

  async getMoviesCount() {
    if (!this.db) return 0;
    const r = await this.db.getFirstAsync('SELECT COUNT(*) as count FROM movies') as any;
    return r?.count || 0;
  }

  // ── Routers ─────────────────────────────────────────────────────────────────

  async saveRouters(routers: any[]) {
    await this.ensureDB();
    // Clear old list before inserting fresh data
    await this.db.runAsync('DELETE FROM routers');
    for (const r of routers) {
      await this.db.runAsync(
        `INSERT OR REPLACE INTO routers
         (id, uuid, name, mac, mac_5g, ssid, ssid5g,
          city, region, country, latitude, longitude, config, cached_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        r.id || null,
        r.uuid || null,
        r.name || '',
        r.mac || null,
        r.mac_5g || null,
        r.ssid || null,
        r.ssid5g || null,
        r.city || null,
        r.region || null,
        r.country || null,
        r.latitude ? parseFloat(String(r.latitude)) : null,
        r.longitude ? parseFloat(String(r.longitude)) : null,
        r.config ? JSON.stringify(r.config) : null
      );
    }
  }

  async getRouters(): Promise<any[]> {
    if (!this.db) return [];
    const results = await this.db.getAllAsync(
      'SELECT * FROM routers ORDER BY name ASC'
    ) as any[];
    return results.map((r) => ({
      ...r,
      config: r.config ? this._parseJson(r.config, {}) : undefined,
    }));
  }

  // ── Profile ─────────────────────────────────────────────────────────────────

  async saveProfile(profile: any) {
    await this.ensureDB();
    await this.db.runAsync(
      `INSERT OR REPLACE INTO profile
       (id, user_id, username, plan_name, balance, available_downloads,
        email, phone, raw_json, cached_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      profile.user_id || null,
      profile.name || profile.username || null,
      profile.plan_name || null,
      String(profile.balance ?? ''),
      profile.available_downloads ?? 0,
      profile.email || null,
      profile.phone || null,
      JSON.stringify(profile)
    );
  }

  async getProfile(): Promise<any | null> {
    if (!this.db) return null;
    const r = await this.db.getFirstAsync(
      'SELECT * FROM profile WHERE id = 1'
    ) as any;
    if (!r) return null;
    return r.raw_json ? this._parseJson(r.raw_json, r) : r;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private _parseJson(value: any, fallback: any): any {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
  }
}

export const databaseHelper = new DatabaseHelper();
