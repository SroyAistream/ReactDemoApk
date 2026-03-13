import { databaseHelper } from '../../../../core/database/database_helper';
import { storageHelper } from '../../../../core/utils/storage_helper';
import { STORAGE_KEYS } from '../../../../core/constants/api_constants';
import { AuthResponse } from '../../domain/entities/user';

export class AuthLocalDataSource {
  async saveUser(userData: AuthResponse, deviceId: string): Promise<void> {
    try {
      // Save to SQLite
      await databaseHelper.saveUser({
        user_id: userData.user_id,
        password: userData.password,
        token: userData.token,
        token_expiry: userData.token_expiry_times,
        device_id: deviceId,
        plan_name: userData.plan?.name || '',
        plan_expiry: userData.plan?.expiry || '',
      });

      // Save to AsyncStorage for quick access
      await storageHelper.multiSet([
        [STORAGE_KEYS.USER_ID, userData.user_id],
        [STORAGE_KEYS.PASSWORD, userData.password],
        [STORAGE_KEYS.TOKEN, userData.token],
        [STORAGE_KEYS.TOKEN_EXPIRY, userData.token_expiry_times],
        [STORAGE_KEYS.DEVICE_ID, deviceId],
        [STORAGE_KEYS.IS_LOGGED_IN, 'true'],
      ]);
    } catch (error) {
      console.error('Save user error:', error);
      throw error;
    }
  }

  async getUser(deviceId: string): Promise<any> {
    try {
      return await databaseHelper.getUser(deviceId);
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      const isLoggedIn = await storageHelper.getItem(STORAGE_KEYS.IS_LOGGED_IN);
      const token = await storageHelper.getItem(STORAGE_KEYS.TOKEN);
      return isLoggedIn === 'true' && !!token;
    } catch (error) {
      console.error('Check login error:', error);
      return false;
    }
  }

  async clearUser(): Promise<void> {
    try {
      const deviceId = await storageHelper.getItem(STORAGE_KEYS.DEVICE_ID);
      if (deviceId) {
        await databaseHelper.deleteUser(deviceId);
      }
      await storageHelper.clear();
    } catch (error) {
      console.error('Clear user error:', error);
      throw error;
    }
  }
}

export const authLocalDataSource = new AuthLocalDataSource();
