/**
 * database_helper.web.ts — AsyncStorage-backed caching for web platform.
 * SQLite is not available on web; we use AsyncStorage as JSON storage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  MOVIES:    '__db_movies',
  ROUTERS:   '__db_routers',
  PROFILE:   '__db_profile',
  DOWNLOADS: '__db_downloads',
};

class DatabaseHelper {
  async init() { /* no-op on web */ }

  // ── Users (auth uses AsyncStorage directly) ──────────────────────────────
  async saveUser(_d: any) { /* handled by auth provider */ }
  async getUser(_id: string) { return null; }
  async deleteUser(_id: string) { /* no-op */ }

  // ── Movies ────────────────────────────────────────────────────────────────

  async saveMovies(movies: any[]) {
    try {
      await AsyncStorage.setItem(KEYS.MOVIES, JSON.stringify(movies));
    } catch {}
  }

  async getMovies(_limit = 200, _offset = 0): Promise<any[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.MOVIES);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  async searchMovies(query: string): Promise<any[]> {
    const all = await this.getMovies();
    const q = query.toLowerCase();
    return all.filter(
      (m) => m.name?.toLowerCase().includes(q) || m.synopsis?.toLowerCase().includes(q)
    );
  }

  async clearMovies() {
    try { await AsyncStorage.removeItem(KEYS.MOVIES); } catch {}
  }

  async clearAllCachedData() {
    try {
      await AsyncStorage.multiRemove(Object.values(KEYS));
      console.log('[DB] Cleared all cached web data');
    } catch {}
  }

  async getMoviesCount(): Promise<number> {
    const all = await this.getMovies();
    return all.length;
  }

  // ── Routers ───────────────────────────────────────────────────────────────

  async saveRouters(routers: any[]) {
    try {
      await AsyncStorage.setItem(KEYS.ROUTERS, JSON.stringify(routers));
    } catch {}
  }

  async getRouters(): Promise<any[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.ROUTERS);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  async saveProfile(profile: any) {
    try {
      await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
    } catch {}
  }

  async getProfile(): Promise<any | null> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.PROFILE);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // ── Downloads ─────────────────────────────────────────────────────────────

  async saveDownload(download: any): Promise<void> {
    try {
      const all = await this.getDownloads();
      const idx = all.findIndex(d => d.movie_id === String(download.movie_id));
      const now = new Date().toISOString();
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...download, movie_id: String(download.movie_id), updated_at: now };
      } else {
        all.push({ ...download, movie_id: String(download.movie_id), created_at: now, updated_at: now });
      }
      await AsyncStorage.setItem(KEYS.DOWNLOADS, JSON.stringify(all));
    } catch {}
  }

  async getDownloads(): Promise<any[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.DOWNLOADS);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  async getDownloadByMovieId(movieId: string | number): Promise<any | null> {
    const all = await this.getDownloads();
    return all.find(d => d.movie_id === String(movieId)) ?? null;
  }

  async getPendingDownloads(): Promise<any[]> {
    const all = await this.getDownloads();
    return all.filter(d => d.status === 'pending');
  }

  async updateDownloadStatus(
    movieId: string | number,
    status: string,
    progress?: number,
    localPath?: string
  ): Promise<void> {
    try {
      const all = await this.getDownloads();
      const idx = all.findIndex(d => d.movie_id === String(movieId));
      if (idx >= 0) {
        all[idx] = {
          ...all[idx],
          status,
          progress: progress ?? all[idx].progress,
          local_path: localPath ?? all[idx].local_path,
          updated_at: new Date().toISOString(),
        };
        await AsyncStorage.setItem(KEYS.DOWNLOADS, JSON.stringify(all));
      }
    } catch {}
  }

  async deleteDownload(movieId: string | number): Promise<void> {
    try {
      const all = await this.getDownloads();
      await AsyncStorage.setItem(
        KEYS.DOWNLOADS,
        JSON.stringify(all.filter(d => d.movie_id !== String(movieId)))
      );
    } catch {}
  }
}

export const databaseHelper = new DatabaseHelper();
