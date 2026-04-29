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
  fetchProfile: (isHubConnected: boolean,forceRefresh?: boolean) => Promise<void>;
  clearError: () => void;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  isLoading: false,
  isRefreshing: false,
  isSyncing: false,
  error: null,

  fetchProfile: async (isHubConnected: boolean,forceRefresh = false) => {
    await databaseHelper.init(); // Gatekeeper

    if (forceRefresh) {
     // Pull-to-refresh: show spinner, try to hit API
      set({ isRefreshing: true, error: null });
      try {
        // ✅ FIX: Pass network state to repository
        const fresh = await profileRepository.syncFromApi(isHubConnected);
        if (fresh) {
          set({ profile: fresh });
        }
      } catch (err: any) {
        console.warn('[ProfileStore] Refresh failed, keeping cache:', err);
        // ✅ FIX: "Swallow the Error" - Only set error if we have NO cached profile to show
        if (!get().profile) {
          set({ error: err?.message ?? 'Failed to refresh profile' });
        }
      } finally {
        set({ isRefreshing: false, isSyncing: false });
      }
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
        profileRepository.syncFromApi(isHubConnected).then((fresh) => {
          if (fresh) {
            console.log('[ProfileStore] Background sync: fresh profile received');
            set({ profile: fresh});
          } 
          // else {
          //   set({ isSyncing: false });
          // }
        }).catch((err) => {
            // Background fails silently, keeping UI completely clean
            console.warn('[ProfileStore] Background sync failed, keeping cache:', err);
          }).finally(() => {
            set({ isSyncing: false });
          });
      }
    } else {
      // No cache — must wait for API
      set({ isLoading: true, error: null });
      try {
        const fresh = await profileRepository.syncFromApi(isHubConnected  );
        set({ profile: fresh, isLoading: false, error: null });
      } catch (err: any) {
        set({ isLoading: false, error: err?.message ?? 'Failed to load profile' });
      }
    }
  },

  clearError: () => set({ error: null }),
  clearProfile: () => set({ profile: null }),
}));
