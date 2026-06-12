/**
 * movies_provider.ts — Android-equivalent offline-first Zustand store
 *
 * Behavior:
 *   1. Load DB instantly → render UI
 *   2. Use cached data unless cache is empty or user refreshes
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
// ─────────────────────────────────────────────
// STORE TYPE
// ─────────────────────────────────────────────
interface MoviesState {
  movies: MovieResponse[];
  isLoading: boolean;
  isRefreshing: boolean;
  isSyncing: boolean;
  error: string | null;
  // Add isHubConnected as a required parameter
 fetchMovies: (isHubConnected: boolean, forceRefresh?: boolean) => Promise<void>;
  // fetchMovies: (forceRefresh?: boolean) => Promise<void>;
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
  fetchMovies: async (isHubConnected: boolean,forceRefresh = false) => {
    await ensureDb();

    // ─────────────────────────────────────────
    // FORCE REFRESH (PULL TO REFRESH)
    // ─────────────────────────────────────────
    // ─────────────────────────────────────────
// FORCE REFRESH (PULL TO REFRESH / Master Sync)
// ─────────────────────────────────────────
if (forceRefresh) {
  set({ isRefreshing: true, error: null });

  try {
    const fresh = await moviesRepository.syncFromApi(isHubConnected);

    if (fresh.length > 0) {
      set({ movies: fresh });
    } else {
      // API returned empty list, safely load whatever we have in cache
      const cached = await moviesRepository.getCachedMovies();
      if (cached.length > 0) set({ movies: cached });
    }

  } catch (err: any) {
    console.log('[MoviesStore] Refresh failed, trying cache fallback:', err);
    
    // 🔥 CRITICAL FIX: If API fails, fall back to SQLite cache so UI isn't blank
    const cached = await moviesRepository.getCachedMovies();
    if (cached.length > 0) {
      set({ movies: cached, error: null });
    } else if (get().movies.length === 0) {
      set({ error: err?.message ?? 'Refresh failed' });
    }
  } finally {
    set({ isRefreshing: false });
  }

  return;
}
    // if (forceRefresh) {
    //   set({ isRefreshing: true, error: null });

    //   try {
    //     const fresh = await moviesRepository.syncFromApi(isHubConnected);

    //    if (fresh.length > 0) {
    //       set({ movies: fresh });
    //     }

    //   } catch (err: any) {
    //    console.log('[MoviesStore] Refresh failed:', err);
    //    if (get().movies.length === 0) {
    //       set({ error: err?.message ?? 'Refresh failed' });
    //     }
    //   } finally {
    //    set({ isRefreshing: false });
    //   }

    //   return;
    // }

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
      const fresh = await moviesRepository.syncFromApi(isHubConnected);

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

