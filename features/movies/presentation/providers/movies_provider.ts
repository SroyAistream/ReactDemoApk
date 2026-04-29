/**
 * movies_provider.ts — Android-equivalent offline-first Zustand store
 *
 * Behavior:
 *   1. Load DB instantly → render UI
 *   2. Always try API in background
 *   3. Never block UI
 *   4. Never clear UI on API failure
 *   5. Prevent duplicate API calls
 */

import { create } from 'zustand';
import { moviesRepository } from '../../data/repositories/movies_repository_impl';
import { databaseHelper } from '../../../../core/database/database_helper';
import { MovieResponse } from '../../domain/entities/movie';

// ─────────────────────────────────────────────
// DB INIT (SAFE SINGLETON)
// ─────────────────────────────────────────────
let dbInitPromise: Promise<void> | null = null;

async function ensureDb() {
  if (!dbInitPromise) {
    dbInitPromise = databaseHelper.init();
  }
  return dbInitPromise;
}

// ─────────────────────────────────────────────
// SYNC LOCK (PREVENT DUPLICATE API CALLS)
// ─────────────────────────────────────────────
let syncPromise: Promise<void> | null = null;

// ─────────────────────────────────────────────
// STORE TYPE
// ─────────────────────────────────────────────
interface MoviesState {
  movies: MovieResponse[];
  isLoading: boolean;
  isRefreshing: boolean;
  isSyncing: boolean;
  error: string | null;

  fetchMovies: (forceRefresh?: boolean) => Promise<void>;
  clearError: () => void;
  searchMovies: (query: string) => Promise<MovieResponse[]>;
}

// ─────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────
export const useMoviesStore = create<MoviesState>((set, get) => ({

  movies: [],
  isLoading: false,
  isRefreshing: false,
  isSyncing: false,
  error: null,

  // ─────────────────────────────────────────────
  // MAIN FUNCTION
  // ─────────────────────────────────────────────
  fetchMovies: async (forceRefresh = false) => {
    await ensureDb();

    // ─────────────────────────────────────────
    // FORCE REFRESH (PULL TO REFRESH)
    // ─────────────────────────────────────────
    if (forceRefresh) {
      set({ isRefreshing: true, error: null });

      try {
        const fresh = await moviesRepository.syncFromApi();

        if (fresh.length > 0) {
          set({ movies: fresh });
        } else {
          console.warn('[MoviesStore] API returned empty on refresh');
        }

      } catch (err: any) {
        console.log('[MoviesStore] Refresh failed:', err);
        set({ error: err?.message ?? 'Refresh failed' });
      } finally {
        set({ isRefreshing: false });
      }

      return;
    }

    // ─────────────────────────────────────────
    // STEP 1: LOAD CACHE (INSTANT UI)
    // ─────────────────────────────────────────
    try {
      const cached = await moviesRepository.getCachedMovies();

      if (cached.length > 0) {
        console.log(`[MoviesStore] Loaded ${cached.length} cached movies`);

        set({
          movies: cached,
          isLoading: false,
          error: null
        });

        // ─────────────────────────────────────
        // STEP 2: BACKGROUND SYNC
        // ─────────────────────────────────────
        triggerBackgroundSync(set, get);

        return;
      }

    } catch (e) {
      console.log('[MoviesStore] Cache load failed:', e);
    }

    // ─────────────────────────────────────────
    // STEP 3: NO CACHE → LOAD FROM API
    // ─────────────────────────────────────────
    set({ isLoading: true, error: null });

    try {
      const fresh = await moviesRepository.syncFromApi();

      set({
        movies: fresh,
        isLoading: false
      });

    } catch (err: any) {
      console.log('[MoviesStore] Initial API load failed:', err);

      set({
        isLoading: false,
        error: err?.message ?? 'Failed to load movies'
      });
    }
  },

  clearError: () => set({ error: null }),

  searchMovies: async (query: string) => {
    await ensureDb();
    return moviesRepository.searchMovies(query);
  },

}));

// ─────────────────────────────────────────────
// BACKGROUND SYNC FUNCTION
// ─────────────────────────────────────────────
function triggerBackgroundSync(set: any, get: any) {

  if (syncPromise) return; // 🔥 prevent duplicate calls

  console.log('[MoviesStore] Starting background sync...');

  set({ isSyncing: true });

  syncPromise = moviesRepository.syncFromApi()
    .then((fresh) => {
      if (fresh.length > 0) {
        console.log(`[MoviesStore] Synced ${fresh.length} fresh movies`);
        set({ movies: fresh });
      } else {
        console.warn('[MoviesStore] API returned empty, keeping cached data');
      }
    })
    .catch((e) => {
      console.log('[MoviesStore] Background sync failed:', e);
    })
    .finally(() => {
      set({ isSyncing: false });
      syncPromise = null;
    });
}