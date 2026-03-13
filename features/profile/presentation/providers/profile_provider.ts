/**
 * profile_provider.ts — Offline-first Zustand store for user profile.
 *
 * Pattern:
 *   1. Load cached data from SQLite immediately → render UI
 *   2. Trigger background API sync → update store on success
 *   3. On API failure: keep cached data, never clear UI
 */
import { create } from 'zustand';
import { profileRepository } from '../../data/repositories/profile_repository_impl';
import { databaseHelper } from '../../../../core/database/database_helper';
import { Profile } from '../../domain/entities/profile';

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    try {
      await databaseHelper.init();
      dbInitialized = true;
    } catch (e) {
      console.warn('[ProfileStore] DB init failed (web?):', e);
      dbInitialized = true;
    }
  }
}

interface ProfileState {
  profile: Profile | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isSyncing: boolean;
  error: string | null;

  /**
   * Primary entry point.
   * Renders cache instantly, then syncs API in background.
   * forceRefresh = true skips cache and shows spinner.
   */
  fetchProfile: (forceRefresh?: boolean) => Promise<void>;
  clearError: () => void;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  isLoading: false,
  isRefreshing: false,
  isSyncing: false,
  error: null,

  fetchProfile: async (forceRefresh = false) => {
    await ensureDb();

    if (forceRefresh) {
      // Pull-to-refresh: show spinner, block on API
      set({ isRefreshing: true, error: null });
      const fresh = await profileRepository.syncFromApi();
      const display = fresh ?? await profileRepository.getCachedProfile();
      set({ profile: display, isRefreshing: false, isSyncing: false });
      return;
    }

    // Step 1: Load cache immediately
    const cached = await profileRepository.getCachedProfile();
    if (cached) {
      console.log('[ProfileStore] Serving cached profile instantly');
      set({ profile: cached, isLoading: false, error: null });

      // Step 2: Background sync (non-blocking)
      if (!get().isSyncing) {
        set({ isSyncing: true });
        profileRepository.syncFromApi().then((fresh) => {
          if (fresh) {
            console.log('[ProfileStore] Background sync: fresh profile received');
            set({ profile: fresh, isSyncing: false });
          } else {
            set({ isSyncing: false });
          }
        }).catch(() => set({ isSyncing: false }));
      }
    } else {
      // No cache — must wait for API
      set({ isLoading: true, error: null });
      try {
        const fresh = await profileRepository.syncFromApi();
        set({ profile: fresh, isLoading: false, error: null });
      } catch (err: any) {
        set({ isLoading: false, error: err?.message ?? 'Failed to load profile' });
      }
    }
  },

  clearError: () => set({ error: null }),
  clearProfile: () => set({ profile: null }),
}));
