/**
 * routers_provider.ts — Offline-first Zustand store for routers (hubs).
 *
 * Pattern:
 *   1. Load cached data from SQLite immediately → render UI
 *   2. Trigger background API sync → update store on success
 *   3. On API failure: keep cached data, never clear UI
 */
import { create } from 'zustand';
import { routersRepository } from '../../data/repositories/routers_repository_impl';
import { databaseHelper } from '../../../../core/database/database_helper';
import { Router } from '../../domain/entities/router';

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    try {
      await databaseHelper.init();
      dbInitialized = true;
    } catch (e) {
      console.warn('[RoutersStore] DB init failed (web?):', e);
      dbInitialized = true;
    }
  }
}

interface RoutersState {
  routers: Router[];
  isLoading: boolean;
  isRefreshing: boolean;
  isSyncing: boolean;
  error: string | null;

  /**
   * Primary entry point.
   * Renders cache instantly, then syncs API in background.
   * forceRefresh = true skips cache and shows spinner.
   */
  fetchRouters: (isHubConnected:boolean,forceRefresh?: boolean) => Promise<void>;
  clearError: () => void;
}

export const useRoutersStore = create<RoutersState>((set, get) => ({
  routers: [],
  isLoading: false,
  isRefreshing: false,
  isSyncing: false,
  error: null,

  fetchRouters: async (isHubConnected:boolean,forceRefresh = false) => {
    await databaseHelper.init(); // Gatekeeper
    if (forceRefresh) {
     try {
      const fresh = await routersRepository.syncFromApi(isHubConnected);
      if (fresh.length > 0) set({ routers: fresh });
    } catch (err: any) {
      console.warn('[RoutersStore] Refresh failed, keeping cache:', err);
      // ❌ THE FIX: Swallow the error if we already have cached routers
      if (get().routers.length === 0) {
        set({ error: 'Failed to find hubs.' });
      }
    }
    return;
    }

    // Step 1: Load cache immediately
    const cached = await routersRepository.getCachedRouters();
    if (cached.length > 0) {
      console.log(`[RoutersStore] Serving ${cached.length} cached routers instantly`);
      set({ routers: cached, isLoading: false, error: null });

      // Step 2: Background sync (non-blocking)
      if (!get().isSyncing) {
        set({ isSyncing: true });
        routersRepository.syncFromApi(isHubConnected).then((fresh) => {
          if (fresh.length > 0) {
            console.log(`[RoutersStore] Background sync: ${fresh.length} fresh routers`);
            set({ routers: fresh, isSyncing: false });
          } else {
            set({ isSyncing: false });
          }
        }).catch(() => set({ isSyncing: false }));
      }
    } else {
      // No cache — must wait for API
      set({ isLoading: true, error: null });
      try {
        const fresh = await routersRepository.syncFromApi(isHubConnected);
        set({ routers: fresh, isLoading: false, error: null });
      } catch (err: any) {
        set({ isLoading: false, error: err?.message ?? 'Failed to load routers' });
      }
    }
  },

  clearError: () => set({ error: null }),
}));
