/**
 * movies_provider.ts — Offline-first Zustand store for movies.
 *
 * Pattern:
 *   1. Load cached data from SQLite immediately → render UI
 *   2. Trigger background API sync → update store on success
 *   3. On API failure: keep cached data, never clear UI
 */
import { create } from 'zustand';
import { moviesRepository } from '../../data/repositories/movies_repository_impl';
import { databaseHelper } from '../../../../core/database/database_helper';
import { MovieResponse } from '../../domain/entities/movie';

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    try {
      await databaseHelper.init();
      dbInitialized = true;
    } catch (e) {
      console.warn('[MoviesStore] DB init failed (web?):', e);
      dbInitialized = true; // Mark as done to avoid retrying on every call
    }
  }
}

interface MoviesState {
  movies: MovieResponse[];
  isLoading: boolean;
  isRefreshing: boolean;
  isSyncing: boolean;     // background sync in progress
  error: string | null;

  /**
   * Primary entry point.
   * Renders cache instantly, then syncs API in background.
   * forceRefresh = true skips cache and shows spinner.
   */
  fetchMovies: (forceRefresh?: boolean) => Promise<void>;
  clearError: () => void;
  searchMovies: (query: string) => Promise<MovieResponse[]>;
}

export const useMoviesStore = create<MoviesState>((set, get) => ({
  movies: [],
  isLoading: false,
  isRefreshing: false,
  isSyncing: false,
  error: null,

  fetchMovies: async (forceRefresh = false) => {
    await ensureDb();

    if (forceRefresh) {
      // Pull-to-refresh: show spinner, block on API
      set({ isRefreshing: true, error: null });
      const fresh = await moviesRepository.syncFromApi();
      const display = fresh.length > 0 ? fresh : await moviesRepository.getCachedMovies();
      set({ movies: display, isRefreshing: false, isSyncing: false });
      return;
    }

    // Step 1: Load cache immediately
    const cached = await moviesRepository.getCachedMovies();
    if (cached.length > 0) {
      console.log(`[MoviesStore] Serving ${cached.length} cached movies instantly`);
      set({ movies: cached, isLoading: false, error: null });
      // Step 2: Background sync (non-blocking)
      if (!get().isSyncing) {
        set({ isSyncing: true });
        moviesRepository.syncFromApi().then((fresh) => {
          if (fresh.length > 0) {
            console.log(`[MoviesStore] Background sync: ${fresh.length} fresh movies`);
            set({ movies: fresh, isSyncing: false });
          } else {
            set({ isSyncing: false });
          }
        }).catch(() => set({ isSyncing: false }));
      }
    } else {
      // No cache — must wait for API
      set({ isLoading: true, error: null });
      try {
        const fresh = await moviesRepository.syncFromApi();
        set({ movies: fresh, isLoading: false, error: null });
      } catch (err: any) {
        set({ isLoading: false, error: err?.message ?? 'Failed to load movies' });
      }
    }
  },

  clearError: () => set({ error: null }),

  searchMovies: async (query: string) => {
    await ensureDb();
    return moviesRepository.searchMovies(query);
  },
}));
