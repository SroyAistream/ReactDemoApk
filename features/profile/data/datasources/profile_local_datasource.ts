import { databaseHelper } from '../../../../core/database/database_helper';
import { Profile, ProfileResponse } from '../../domain/entities/profile';

export class ProfileLocalDataSource {
  /**
   * Save profile to local SQLite database.
   */
  async saveProfile(profile: ProfileResponse): Promise<void> {
    try {
      const row = {
        user_id: profile.user_id ?? null,
        name: profile.name ?? null,
        account_id: profile.account_id ?? profile.user_id ?? null,
        balance: typeof profile.balance === 'number' ? profile.balance : parseFloat(String(profile.balance)) || 0,
        plan_name: profile.plan_name ?? null,
        available_downloads: profile.available_downloads ?? 0,
        email: profile.email ?? null,
        phone: profile.phone ?? null,
      };
      await databaseHelper.saveProfile(row);
      console.log('[ProfileLocal] Saved profile to cache');
    } catch (error) {
      console.error('[ProfileLocal] saveProfile error:', error);
      throw error;
    }
  }

  /**
   * Get cached profile from local database.
   */
  async getProfile(): Promise<Profile | null> {
    try {
      const row = await databaseHelper.getProfile();
      if (!row) return null;
      return this.mapToEntity(row);
    } catch (error) {
      console.error('[ProfileLocal] getProfile error:', error);
      return null;
    }
  }

  /**
   * Maps DB row back to Profile entity.
   */
  private mapToEntity(row: any): Profile {
    return {
      user_id: row.user_id ?? undefined,
      name: row.username ?? row.name ?? undefined,
      account_id: row.account_id ?? row.user_id ?? undefined,
      balance: typeof row.balance === 'number' ? row.balance : parseFloat(String(row.balance)) || 0,
      plan_name: row.plan_name ?? undefined,
      available_downloads: row.available_downloads ?? 0,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
    };
  }
}

export const profileLocalDataSource = new ProfileLocalDataSource();
