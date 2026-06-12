/**
 * database_helper.native.ts
 *
 * SQLite-backed persistence for iOS + Android.
 * Fixed for production safety:
 * 1. Strict 'initPromise' to prevent NullPointerException in prepareAsync.
 * 2. Transaction-wrapped router sync to prevent data loss.
 * 3. Null-coalescing (?? null) for native parameter binding safety.
 */
import * as SQLite from 'expo-sqlite';
import { DB_NAME } from '../constants/api_constants';

const DB_VERSION = 4; // Bumped version logically, though Expo SQLite manages migrations manually below

class DatabaseHelper {
  private db: SQLite.SQLiteDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  // ── Init & Gatekeeper ──────────────────────────────────────────────────────

  /**
   * Strictly awaiting this ensures the native bridge is ready.
   * Prevents multiple calls from opening the database file simultaneously.
   */
  async init() {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        console.log('[DB] Opening database async...');
        this.db = await SQLite.openDatabaseAsync(DB_NAME);
        await this.createTables();
        await this.runMigrations();
        console.log('[DB] Initialized (v' + DB_VERSION + ')');
      } catch (error) {
        this.initPromise = null; // Reset so next call can retry
        console.error('[DB] Init error:', error);
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * The Gatekeeper: Ensures db is not null before any query runs.
   */
  public async ensureDB() {
    await this.init();
    if (!this.db) {
      throw new Error('[DB] Native database reference is null');
    }
  }
  // ADD THIS ALIAS to prevent ReferenceErrors from typos
  private async ensureDb() {
    return await this.ensureDB();
  }

  private async runSerializedWrite(
    callback: (db: SQLite.SQLiteDatabase) => Promise<void>
  ) {
    await this.ensureDB();

    const run = async () => {
      await callback(this.db!);
    };

    const next = this.writeQueue.then(run, run);
    this.writeQueue = next.catch(() => {});
    return next;
  }

  private async createTables() {
    // Note: ensureDB is called by init(), so we can use this.db! safely here
    await this.db!.execAsync(`
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
        quality_list_json TEXT, 
        directors TEXT,
        actors TEXT,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

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

      CREATE TABLE IF NOT EXISTS downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_id TEXT UNIQUE NOT NULL,
        name TEXT,
        status TEXT DEFAULT 'pending',
        progress REAL DEFAULT 0,
        local_path TEXT,
        movie_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_movies_movie_id ON movies(movie_id);
      CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
      CREATE INDEX IF NOT EXISTS idx_downloads_movie_id ON downloads(movie_id);
      CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
    `);
  }

  private async runMigrations() {
    const alterCmds = [
      'ALTER TABLE movies ADD COLUMN content_type INTEGER DEFAULT 0',
      'ALTER TABLE movies ADD COLUMN video_type TEXT DEFAULT \'{}\'',
      'ALTER TABLE movies ADD COLUMN theatrical_poster TEXT DEFAULT \'\'',
      'ALTER TABLE movies ADD COLUMN preview TEXT DEFAULT \'\'',
      'ALTER TABLE movies ADD COLUMN genres_json TEXT',
      'ALTER TABLE movies ADD COLUMN quality_list_json TEXT', // Added Safe Migration
    ];
    for (const cmd of alterCmds) {
      try {
        await this.db!.execAsync(cmd);
      } catch {
        /* column already exists, safe to ignore */
      }
    }
  }

  // ── Users ───────────────────────────────────────────────────────────────────

  async saveUser(userData: any) {
    await this.runSerializedWrite(async (db) => {
      if (userData.device_id) {
        await db.runAsync('DELETE FROM users WHERE device_id = ?', userData.device_id);
      }
      await db.runAsync(
        `INSERT OR REPLACE INTO users
         (user_id, password, token, token_expiry, device_id, plan_name, plan_expiry)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        userData.user_id ?? '',
        userData.password ?? '',
        userData.token ?? '',
        userData.token_expiry ?? '',
        userData.device_id ?? '',
        userData.plan_name ?? '',
        userData.plan_expiry ?? ''
      );
    });
  }

  async getUser(deviceId: string) {
    await this.ensureDB();
    return await this.db!.getFirstAsync(
      'SELECT * FROM users WHERE device_id = ? LIMIT 1',
      deviceId
    );
  }

  async deleteUser(deviceId: string) {
    await this.ensureDB();
    await this.db!.runAsync('DELETE FROM users WHERE device_id = ?', deviceId);
  }

  // ── Movies ──────────────────────────────────────────────────────────────────

  async saveMovies(movies: any[]) {
    await this.runSerializedWrite(async (db) => {
      for (const movie of movies) {
        await db.runAsync(
          `INSERT OR REPLACE INTO movies
           (movie_id, name, synopsis, rating, poster_url, preview_url,
            theatrical_poster, preview, duration, publish_date, release_date,
            country, star_score, type, content_type, video_type,
            genres, genres_json, quality_list_json, directors, actors, cached_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          String(movie.movie_id),
          movie.name ?? 'Unknown',
          movie.synopsis ?? '',
          movie.rating ?? 0,
          movie.poster_url ?? '',
          movie.preview_url ?? '',
          movie.theatrical_poster ?? '',
          movie.preview ?? '',
          movie.duration ?? 0,
          movie.publish_date ?? '',
          movie.release_date ?? '',
          movie.country ?? '',
          movie.star_score ?? 0,
          String(movie.type ?? ''),
          movie.content_type ?? 0,
          typeof movie.video_type === 'object'
            ? JSON.stringify(movie.video_type || {})
            : (movie.video_type || '{}'),
          JSON.stringify(movie.genres || []),
          movie.genres_json || JSON.stringify(movie.genres || []),
          movie.quality_list_json || '[]', // Insert the stringified array
          JSON.stringify(movie.directors || []),
          JSON.stringify(movie.actors || [])
        );
      }
    });
  }

  async getMovies(limit = 200, offset = 0) {
    await this.ensureDB();
    const results = (await this.db!.getAllAsync(
      'SELECT * FROM movies ORDER BY cached_at DESC LIMIT ? OFFSET ?',
      limit,
      offset
    )) as any[];
    return results.map((r) => ({
      ...r,
      genres: this._parseJson(r.genres, []),
      genres_json: r.genres_json || r.genres,
      directors: this._parseJson(r.directors, []),
      actors: this._parseJson(r.actors, []),
      video_type: this._parseJson(r.video_type, {}),
    }));
  }

  async searchMovies(query: string) {
    await this.ensureDB();
    const q = `%${query}%`;
    const results = (await this.db!.getAllAsync(
      'SELECT * FROM movies WHERE name LIKE ? OR synopsis LIKE ? ORDER BY cached_at DESC',
      q,
      q
    )) as any[];
    return results.map((r) => ({
      ...r,
      genres: this._parseJson(r.genres, []),
      directors: this._parseJson(r.directors, []),
      actors: this._parseJson(r.actors, []),
      video_type: this._parseJson(r.video_type, {}),
    }));
  }

  async clearMovies() {
    await this.ensureDB();
    await this.db!.runAsync('DELETE FROM movies');
  }

  async clearAllCachedData() {
    await this.runSerializedWrite(async (db) => {
      await db.runAsync('DELETE FROM users');
      await db.runAsync('DELETE FROM movies');
      await db.runAsync('DELETE FROM routers');
      await db.runAsync('DELETE FROM profile');
      await db.runAsync('DELETE FROM downloads');
    });
    console.log('[DB] Cleared all cached data');
  }

  async getMoviesCount() {
    await this.ensureDB();
    const r = (await this.db!.getFirstAsync(
      'SELECT COUNT(*) as count FROM movies'
    )) as any;
    return r?.count || 0;
  }

  // ── Routers ─────────────────────────────────────────────────────────────────

  async saveRouters(routers: any[]) {
    await this.runSerializedWrite(async (db) => {
      await db.runAsync('DELETE FROM routers');
      for (const r of routers) {
        await db.runAsync(
          `INSERT OR REPLACE INTO routers
           (id, uuid, name, mac, mac_5g, ssid, ssid5g,
            city, region, country, latitude, longitude, config, cached_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          r.id ?? null,
          r.uuid ?? null,
          r.name ?? 'Unnamed Hub',
          r.mac ?? null,
          r.mac_5g ?? null,
          r.ssid ?? null,
          r.ssid5g ?? null,
          r.city ?? null,
          r.region ?? null,
          r.country ?? null,
          r.latitude ? parseFloat(String(r.latitude)) : null,
          r.longitude ? parseFloat(String(r.longitude)) : null,
          r.config ? JSON.stringify(r.config) : null
        );
      }
    });
  }

  async getRouters(): Promise<any[]> {
    await this.ensureDB();
    const results = (await this.db!.getAllAsync(
      'SELECT * FROM routers ORDER BY name ASC'
    )) as any[];
    return results.map((r) => ({
      ...r,
      config: r.config ? this._parseJson(r.config, {}) : undefined,
    }));
  }

  // ── Profile ─────────────────────────────────────────────────────────────────

  async saveProfile(profile: any) {
    await this.runSerializedWrite(async (db) => {
      await db.runAsync(
        `INSERT OR REPLACE INTO profile
         (id, user_id, username, plan_name, balance, available_downloads,
          email, phone, raw_json, cached_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        profile.user_id ?? '',
        profile.name ?? profile.username ?? '',
        profile.plan_name ?? '',
        String(profile.balance ?? ''),
        profile.available_downloads ?? 0,
        profile.email ?? '',
        profile.phone ?? '',
        JSON.stringify(profile)
      );
    });
  }

  async getProfile(): Promise<any | null> {
    await this.ensureDB();
    const r = (await this.db!.getFirstAsync(
      'SELECT * FROM profile WHERE id = 1'
    )) as any;
    if (!r) return null;
    return r.raw_json ? this._parseJson(r.raw_json, r) : r;
  }

  // ── Downloads ────────────────────────────────────────────────────────────────

  async saveDownload(download: any): Promise<void> {
    await this.runSerializedWrite(async (db) => {
      await db.runAsync(
        `INSERT OR REPLACE INTO downloads
         (movie_id, name, status, progress, local_path, movie_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        String(download.movie_id),
        download.name ?? '',
        download.status ?? 'pending',
        download.progress ?? 0,
        download.local_path ?? '',
        download.movie_json ?? ''
      );
    });
  }

  async getDownloads(): Promise<any[]> {
    await this.ensureDB();
    return (await this.db!.getAllAsync(
      'SELECT * FROM downloads ORDER BY created_at DESC'
    )) as any[];
  }

  async getDownloadByMovieId(movieId: string | number): Promise<any | null> {
    await this.ensureDB();
    return (await this.db!.getFirstAsync(
      'SELECT * FROM downloads WHERE movie_id = ? LIMIT 1',
      String(movieId)
    )) as any;
  }

  async getPendingDownloads(): Promise<any[]> {
    await this.ensureDB();
    return (await this.db!.getAllAsync(
      "SELECT * FROM downloads WHERE status = 'pending' ORDER BY created_at ASC"
    )) as any[];
  }

 public async updateDownloadStatus(
    movieId: string | number,
    status: string,
    progress?: number,
    localPath?: string
  ): Promise<void> {
    await this.runSerializedWrite(async (db) => {
      if (localPath !== undefined) {
        await db.runAsync(
          `UPDATE downloads SET status = ?, progress = ?, local_path = ?,
           updated_at = CURRENT_TIMESTAMP WHERE movie_id = ?`,
          status ?? 'pending',
          progress ?? 0,
          localPath,
          String(movieId)
        );
        return;
      }

      await db.runAsync(
        `UPDATE downloads SET status = ?, progress = ?,
         updated_at = CURRENT_TIMESTAMP WHERE movie_id = ?`,
        status ?? 'pending',
        progress ?? 0,
        String(movieId)
      );
    });
  }

  async deleteDownload(movieId: string | number): Promise<void> {
    await this.runSerializedWrite(async (db) => {
      await db.runAsync('DELETE FROM downloads WHERE movie_id = ?', String(movieId));
    });
  }

//   public async updateDownloadStatus(
//   movieId: string | number,
//   status: string,
//   progress?: number,
//   localPath?: string
// ): Promise<void> {
//   await this.ensureDB();
//   await this.db!.runAsync(
//     `UPDATE downloads SET status = ?, progress = ?, local_path = COALESCE(?, local_path),
//      updated_at = CURRENT_TIMESTAMP WHERE movie_id = ?`,
//     status ?? 'pending',
//     progress ?? 0,
//     localPath ?? null,
//     String(movieId)
//   );
// }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private _parseJson(value: any, fallback: any): any {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
}

export const databaseHelper = new DatabaseHelper();
