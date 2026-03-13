/**
 * database_helper.web.ts — AsyncStorage-backed caching for web platform.
 * SQLite is not available on web; we use AsyncStorage as JSON storage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  MOVIES:  '__db_movies',
  ROUTERS: '__db_routers',
  PROFILE: '__db_profile',
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
}

export const databaseHelper = new DatabaseHelper();
