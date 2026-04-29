import { create } from 'zustand';
import { authRepository } from '../../data/repositories/auth_repository_impl';
import { deviceHelper } from '../../../../core/utils/device_helper';
import { AuthResponse } from '../../domain/entities/user';
import { databaseHelper } from '@/core/database/database_helper.native';

interface AuthState {
  user: AuthResponse | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;

  guestLogin: () => Promise<AuthResponse>;
  checkLogin: () => Promise<boolean>;  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  error: null,
  isAuthenticated: false,

  async guestLogin(): Promise<AuthResponse> {
    set({ isLoading: true, error: null });
    try {
      const deviceInfo = await deviceHelper.getDeviceInfo();
      const deviceId = await deviceHelper.getDeviceId();

      console.log('Starting guest login with device:', deviceId);
      console.log('Device manufacturer:', deviceInfo.manufacturer);
      console.log('Device model:', deviceInfo.model);
      
      const response = await authRepository.guestLogin(deviceInfo);
      const return_response = true;

      // Save user data locally
      await authRepository.saveUserLocally(response, deviceId);

      set({
        user: response,
        isLoading: false,
        isAuthenticated: true,
        error: null,
      });

      console.log('Guest login successful');
      return response;
    } catch (error: any) {
      console.log('[AuthRepo] API failed');

    await databaseHelper.init();
    const deviceId = 'SOFLIX_37D5D77C668941608AA5D324EA29FBFC'

    const existingUser = await databaseHelper.getUser(deviceId);
    console.log('existing user',existingUser);

    if (existingUser) {
      console.log('offline fallback')
      return existingUser; // ✅ offline fallback
    }

    // ❌ NO DB → signal UI to show popup
    throw new Error('NO_INTERNET_LOGIN_REQUIRED');
    }
  },

  checkLogin: async () => {
    set({ isLoading: true });
    try {
      const isLoggedIn = await authRepository.isUserLoggedIn();
      set({ isAuthenticated: isLoggedIn, isLoading: false });
      return isLoggedIn;
    } catch (error) {
      console.error('Check login error:', error);
      set({ isAuthenticated: false, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authRepository.logout();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      console.error('Logout error:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
