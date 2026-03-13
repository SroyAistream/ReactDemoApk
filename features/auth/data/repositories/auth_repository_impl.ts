import { AuthRepository } from '../../domain/repositories/auth_repository';
import { AuthResponse } from '../../domain/entities/user';
import { authRemoteDataSource } from '../datasources/auth_remote_datasource';
import { authLocalDataSource } from '../datasources/auth_local_datasource';

export class AuthRepositoryImpl implements AuthRepository {
  async guestLogin(deviceInfo: any): Promise<AuthResponse> {
    try {
      const response = await authRemoteDataSource.guestLogin(deviceInfo);
      return response;
    } catch (error) {
      console.error('Guest login repository error:', error);
      throw error;
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
