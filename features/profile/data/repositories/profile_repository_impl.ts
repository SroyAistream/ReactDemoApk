import { Profile } from '../../domain/entities/profile';
import { profileRemoteDataSource } from '../datasources/profile_remote_datasource';
import { profileLocalDataSource } from '../datasources/profile_local_datasource';

export class ProfileRepositoryImpl {
  /**
   * Offline-first getCachedProfile.
   *
   * Returns cached data immediately (Step 1).
   * Caller should also call syncFromApi() for fresh data (Step 2).
   */
  async getCachedProfile(): Promise<Profile | null> {
    try {
      return await profileLocalDataSource.getProfile();
    } catch (error) {
      console.error('[ProfileRepo] getCachedProfile error:', error);
      return null;
    }
  }

  /**
   * Fetch from API, save to local DB, return fresh profile.
   * Never throws — returns null on error so cached data is preserved.
   */
  async syncFromApi(isHubConnected: boolean): Promise<Profile | null> {
    try {
      console.log('[ProfileRepo] Syncing profile from API...');
      const fresh = await profileRemoteDataSource.getProfile(isHubConnected);
      if (fresh) {
        await profileLocalDataSource.saveProfile(fresh,isHubConnected);
        console.log('[ProfileRepo] Saved profile to cache');
        return await profileLocalDataSource.getProfile();
      }
      return null;
    } catch (error) {
      console.warn('[ProfileRepo] API sync failed (offline?), keeping cache:', error);
      return null;
    }
  }

  /**
   * Legacy method: cache-first with blocking API fetch if no cache.
   */
  async getProfile(isHubConnected: boolean,forceRefresh = false): Promise<Profile | null> {
    if (!forceRefresh) {
      const cached = await this.getCachedProfile();
      if (cached) return cached;
    }
    const fresh = await this.syncFromApi(isHubConnected);
    if (fresh) return fresh;
    return this.getCachedProfile();
  }
}

export const profileRepository = new ProfileRepositoryImpl();
