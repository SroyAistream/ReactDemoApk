import { create } from 'zustand';
import { authRepository } from '../../data/repositories/auth_repository_impl';
import { deviceHelper } from '../../../../core/utils/device_helper';
import { AuthResponse } from '../../domain/entities/user';

interface AuthState {
  user: AuthResponse | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;

  guestLogin: () => Promise<boolean>;
  checkLogin: () => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  error: null,
  isAuthenticated: false,

  guestLogin: async () => {
    set({ isLoading: true, error: null });
    try {
      const deviceInfo = await deviceHelper.getDeviceInfo();
      const deviceId = await deviceHelper.getDeviceId();

      console.log('Starting guest login with device:', deviceId);
      console.log('Device manufacturer:', deviceInfo.manufacturer);
      console.log('Device model:', deviceInfo.model);
      
      const response = await authRepository.guestLogin(deviceInfo);

      // Save user data locally
      await authRepository.saveUserLocally(response, deviceId);

      set({
        user: response,
        isLoading: false,
        isAuthenticated: true,
        error: null,
      });

      console.log('Guest login successful');
      return true;
    } catch (error: any) {
      console.error('Guest login failed:', error);
      set({
        isLoading: false,
        error: error.message || 'Login failed. Please try again.',
        isAuthenticated: false,
      });
      return false;
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
