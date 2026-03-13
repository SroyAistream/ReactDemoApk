import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Backend URL for API calls
// On Emergent platform, /api routes are proxied to port 8001 (FastAPI backend)
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
  
  // Direct to demo.aistream.tv for native (no CORS issues)
  return 'https://demo.aistream.tv';
};

// API Configuration
export const API_CONFIG = {
  BASE_URL: 'https://demo.aistream.tv',
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
  GET_ACCOUNT: '/account',
};

// Storage Keys
export const STORAGE_KEYS = {
  USER_ID: 'user_id',
  PASSWORD: 'password',
  TOKEN: 'token',
  TOKEN_EXPIRY: 'token_expiry',
  DEVICE_ID: 'device_id',
  IS_LOGGED_IN: 'is_logged_in',
};

// Database
export const DB_NAME = 'aistream.db';
export const DB_VERSION = 1;
