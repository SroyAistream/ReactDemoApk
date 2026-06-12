import { databaseHelper } from '../../../../core/database/database_helper';
import { Profile, ProfileResponse } from '../../domain/entities/profile';

export class ProfileLocalDataSource {
  /**
   * Save profile to local SQLite database.
   */
  async saveProfile(profile: ProfileResponse,isHubConnected: boolean): Promise<void> {
    try {
      const rawName = profile.name?.trim() ?? '';
      const rawSurname = profile.surname?.trim() ?? '';
      const fullName = rawName && rawSurname && rawName.toLowerCase().includes(rawSurname.toLowerCase())
        ? rawName
        : [rawName, rawSurname].filter(Boolean).join(' ').trim();
      const balance = typeof profile.balance === 'number'
        ? profile.balance
        : parseFloat(String(profile.balance ?? 0)) || 0;
      const availableDownloads = Number(profile.available_downloads ?? profile.max_downloads ?? 0) || 0;
      const row = {
        ...profile,
        user_id: profile.user_id ?? null,
        name: fullName || profile.user_name || profile.account || profile.user_id || profile.name || null,
        account_id: profile.account_id ?? profile.account ?? profile.user_id ?? null,
        balance,
        plan_name: profile.plan_name ?? null,
        available_downloads: availableDownloads,
        email: profile.email ?? null,
        phone: profile.phone ?? null,
      };
      await databaseHelper.saveProfile(row);
      console.log('[ProfileLocal] Saved profile to cache');
    } catch (error) {
      console.warn('[ProfileLocal] saveProfile skipped:', error);
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
    const rawName = row.name?.trim?.() ?? '';
    const rawSurname = row.surname?.trim?.() ?? '';
    const fullName = rawName && rawSurname && rawName.toLowerCase().includes(rawSurname.toLowerCase())
      ? rawName
      : [rawName, rawSurname].filter(Boolean).join(' ').trim();
    return {
      user_id: row.user_id ?? undefined,
      name: fullName || row.username || row.user_name || row.account || row.user_id || undefined,
      surname: row.surname ?? undefined,
      user_name: row.user_name ?? undefined,
      account: row.account ?? undefined,
      account_id: row.account_id ?? row.account ?? row.user_id ?? undefined,
      balance: typeof row.balance === 'number' ? row.balance : parseFloat(String(row.balance)) || 0,
      plan_name: row.plan_name ?? undefined,
      available_downloads: Number(row.available_downloads ?? row.max_downloads ?? 0) || 0,
      max_downloads: Number(row.max_downloads ?? 0) || undefined,
      enc_accounting: row.enc_accounting ?? undefined,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
    };
  }
}

export const profileLocalDataSource = new ProfileLocalDataSource();
