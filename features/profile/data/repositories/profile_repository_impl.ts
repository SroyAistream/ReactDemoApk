import { Profile, ProfileResponse } from '../../domain/entities/profile';
import { profileRemoteDataSource } from '../datasources/profile_remote_datasource';
import { profileLocalDataSource } from '../datasources/profile_local_datasource';

export class ProfileRepositoryImpl {
  private toProfile(profile: ProfileResponse): Profile {
    const fullName = [profile.name, profile.surname].filter(Boolean).join(' ').trim();
    const balance = typeof profile.balance === 'number'
      ? profile.balance
      : parseFloat(String(profile.balance ?? 0)) || 0;
    const availableDownloads = Number(profile.available_downloads ?? profile.max_downloads ?? 0) || 0;

    const normalized = {
      ...profile,
      name: fullName || profile.user_name || profile.account || profile.user_id || profile.name,
      account_id: profile.account_id || profile.account || profile.user_id,
      balance,
      available_downloads: availableDownloads,
      max_downloads: Number(profile.max_downloads ?? 0) || undefined,
    };

    console.log('[ProfileRepo] Normalized profile for UI:', {
      user_id: normalized.user_id,
      name: normalized.name,
      account_id: normalized.account_id,
      balance: normalized.balance,
      plan_name: normalized.plan_name,
      available_downloads: normalized.available_downloads,
    });

    return normalized;
  }

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
        const profile = this.toProfile(fresh);
        try {
          await profileLocalDataSource.saveProfile(profile, isHubConnected);
          console.log('[ProfileRepo] Profile cache checked');
        } catch (cacheError) {
          console.warn('[ProfileRepo] Profile cache save skipped:', cacheError);
        }
        return profile;
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
