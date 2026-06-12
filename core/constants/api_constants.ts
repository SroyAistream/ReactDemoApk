import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Backend URL for API calls.
const getBackendUrl = () => {
  // Use environment variable if available
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  
  if (Platform.OS === 'web') {
    // On web, we need to route through the Emergent proxy
    // The Emergent platform proxies /api/* to the backend at port 8001
    if (envUrl) {
      return envUrl;
    }
    // Fallback - use the preview URL from window location
    if (typeof window !== 'undefined' && window.location) {
      // Use same origin which has /api proxy configured
      return window.location.origin;
    }
    return '';
  }
  
  // For native, use the environment variable or fallback to direct API
  if (envUrl) {
    return envUrl;
  }
  
  return 'https://demo.aistream.tv';
};

export const getApiBaseUrl = (_isHubConnected = false) => {
  return getBackendUrl();
};

// API Configuration
export const API_CONFIG = {
  BASE_URL: getApiBaseUrl(false),
  TIMEOUT: 30000,
};

// API Endpoints - using /api prefix for backend proxy
export const API_ENDPOINTS = {
  // Auth
  GUEST_LOGIN: '/fag/login/open',
  
  // Movies
  GET_MOVIES: '/fag/movies',
  GET_HOT_MOVIES: '/fag/movies/hot',
  GET_RECOMMENDATIONS: '/fag/movies/recommendation',
  
  // Account
  GET_ACCOUNT: '/fag/account/profile',
};

// Storage Keys
export const STORAGE_KEYS = {
  USER_ID: 'user_id',
  PASSWORD: 'password',
  TOKEN: 'token',
  FMA_TOKEN: 'fma_token',
  ENC_ACCOUNTING: 'enc_accounting',
  TOKEN_EXPIRY: 'token_expiry',
  DEVICE_ID: 'device_id',
  IS_LOGGED_IN: 'is_logged_in',
};

// Database
export const DB_NAME = 'aistream.db';
export const DB_VERSION = 1;
