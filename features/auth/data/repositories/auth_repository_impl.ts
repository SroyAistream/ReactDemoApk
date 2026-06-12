import { AuthRepository } from '../../domain/repositories/auth_repository';
import { AuthResponse } from '../../domain/entities/user';
import { authRemoteDataSource } from '../datasources/auth_remote_datasource';
import { authLocalDataSource } from '../datasources/auth_local_datasource';
import Toast from 'react-native-toast-message';
import { databaseHelper } from '../../../../core/database/database_helper';

export class AuthRepositoryImpl implements AuthRepository {
// async guestLogin(deviceInfo: any): Promise<AuthResponse> {
//   try {
//     const response = await authRemoteDataSource.guestLogin(deviceInfo);

//     await databaseHelper.init();
//     await databaseHelper.saveUser(response);

//     return response;

//   } catch (error: any) {
//     console.log('[AuthRepo] API failed');

//     await databaseHelper.init();

//     const existingUser = await databaseHelper.getUser(deviceInfo.unique_id);

//     if (existingUser) {
//       return existingUser; // ✅ offline fallback
//     }

//     // ❌ NO DB → signal UI to show popup
//     throw new Error('NO_INTERNET_LOGIN_REQUIRED');
//   }
// }
//   async saveUserLocally(userData: AuthResponse, deviceId: string): Promise<void> {
//     await authLocalDataSource.saveUser(userData, deviceId);
//   }

async guestLogin(deviceInfo: any, isHubConnected = false): Promise<AuthResponse> {
    try {
      return await authRemoteDataSource.guestLogin(deviceInfo, isHubConnected);

    } catch (error: any) {
      console.log('[AuthRepo] Remote API failed, attempting offline database fallback...');

      // 3. Fallback to local SQLite database using the REAL dynamic ID
      await databaseHelper.init();
      const existingUser = await databaseHelper.getUser(deviceInfo.unique_id);

      if (existingUser) {
        console.log('[AuthRepo] Offline fallback successful!');
        return existingUser; // ✅ Successfully logged in using cached credentials
      }

      // ❌ No database record exists for this device. Signal UI to show popup.
      throw new Error('NO_INTERNET_LOGIN_REQUIRED');
    }
  }

  async saveUserLocally(userData: AuthResponse, deviceId: string): Promise<void> {
    await authLocalDataSource.saveUser(userData, deviceId);
  }

  async getUserLocally(deviceId: string): Promise<any> {
    return await authLocalDataSource.getUser(deviceId);
  }

  async isUserLoggedIn(): Promise<boolean> {
    return await authLocalDataSource.isLoggedIn();
  }

  async logout(): Promise<void> {
    await authLocalDataSource.clearUser();
  }
}

export const authRepository = new AuthRepositoryImpl();
