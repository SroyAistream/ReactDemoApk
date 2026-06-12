import { AuthResponse } from '../entities/user';

export interface AuthRepository {
  guestLogin(deviceInfo: any, isHubConnected?: boolean): Promise<AuthResponse>;
  saveUserLocally(userData: AuthResponse, deviceId: string): Promise<void>;
  getUserLocally(deviceId: string): Promise<any>;
  isUserLoggedIn(): Promise<boolean>;
  logout(): Promise<void>;
}
