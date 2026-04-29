/**
 * Web-specific database helper that provides a mock implementation.
 * SQLite is not supported on web, so this uses AsyncStorage as a fallback
 * or simply returns empty results for database operations.
 */
import * as SQLite from 'expo-sqlite';


class DatabaseHelper {
    private db: SQLite.SQLiteDatabase | null = null;
  
  async init() {
    console.log('Running on web - SQLite disabled, using AsyncStorage for persistence');
    // On web, we rely on AsyncStorage which is already used for auth tokens
    return Promise.resolve();
  }

  /**
   * The Gatekeeper: Ensures db is not null before any query runs.
   * CHANGED TO PUBLIC so stores can use it.
   */
  public async ensureDB() { // <--- Changed from private to public
    await this.init();
    if (!this.db) {
      throw new Error('[DB] Native database reference is null');
    }
  }

  /**
   * Alias for case-sensitivity safety.
   */
  public async ensureDb() {
    return await this.ensureDB();
  }

  // User operations - web uses AsyncStorage instead
  async saveUser(_userData: any) {
    console.log('Web platform - SQLite saveUser skipped (using AsyncStorage)');
    return Promise.resolve();
  }

  async getUser(_deviceId: string) {
    console.log('Web platform - SQLite getUser skipped (using AsyncStorage)');
    return null;
  }

  async deleteUser(_deviceId: string) {
    console.log('Web platform - SQLite deleteUser skipped');
    return Promise.resolve();
  }

  // Movie operations - return empty arrays on web
  // Movies will be fetched fresh from API each time on web
  async saveMovies(_movies: any[]) {
    console.log('Web platform - SQLite saveMovies skipped (no offline caching)');
    return Promise.resolve();
  }

  async getMovies(_limit: number = 50, _offset: number = 0) {
    console.log('Web platform - returning empty array (movies will be fetched from API)');
    return [];
  }

  async searchMovies(_query: string) {
    console.log('Web platform - returning empty search results (will search from API)');
    return [];
  }

  async clearMovies() {
    console.log('Web platform - clearMovies skipped');
    return Promise.resolve();
  }

  async getMoviesCount() {
    console.log('Web platform - returning 0 for movie count');
    return 0;
  }

  // Router operations - return empty arrays on web
  async saveRouters(_routers: any[]) {
    console.log('Web platform - SQLite saveRouters skipped');
    return Promise.resolve();
  }

  async getRouters(): Promise<any[]> {
    console.log('Web platform - returning empty array (routers will be fetched from API)');
    return [];
  }

  // Profile operations - return null on web
  async saveProfile(_profile: any) {
    console.log('Web platform - SQLite saveProfile skipped');
    return Promise.resolve();
  }

  async getProfile(): Promise<any | null> {
    console.log('Web platform - returning null (profile will be fetched from API)');
    return null;
  }

  // ── Downloads (stub – actual impl in .native.ts / .web.ts) ──────────────

  async saveDownload(_download: any) {
    console.log('Platform stub – saveDownload skipped');
    return Promise.resolve();
  }

  async getDownloads(): Promise<any[]> {
    return [];
  }

  async getDownloadByMovieId(_movieId: string | number): Promise<any | null> {
    return null;
  }

  async getPendingDownloads(): Promise<any[]> {
    return [];
  }

  async updateDownloadStatus(
    _movieId: string | number,
    _status: string,
    _progress?: number,
    _localPath?: string
  ): Promise<void> {}

  async deleteDownload(_movieId: string | number): Promise<void> {}
}



export const databaseHelper = new DatabaseHelper();
