import { apiClient } from '../../../../core/network/api_client';
import { API_ENDPOINTS, getApiBaseUrl } from '../../../../core/constants/api_constants';
import { AuthResponse } from '../../domain/entities/user';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAndroidHeaders } from '../../../../core/network/auth_headers';

// ─────────────────────────────────────────────
// SAFE DATE PARSER (ANDROID-LIKE DEFENSIVE)
// ─────────────────────────────────────────────
function safeParseDate(value: any): string {
  try {
    // Handle null / empty / invalid formats
    if (!value || value === '0000-00-00') {
      console.warn('[Auth] Invalid expiry from API:', value);

      // Fallback → 24 hours from now
      return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }

    const date = new Date(value);

    if (isNaN(date.getTime())) {
      console.warn('[Auth] Failed to parse expiry:', value);

      return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }

    return date.toISOString();
  } catch (e) {
    console.warn('[Auth] Date parsing exception:', e);

    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }
}

// ─────────────────────────────────────────────
// DATASOURCE
// ─────────────────────────────────────────────
export class AuthRemoteDataSource {

  async guestLogin(deviceInfo: any, isHubConnected = false): Promise<AuthResponse> {
    try {

      // ─────────────────────────────────────────
      // BUILD QUERY PARAMS
      // ─────────────────────────────────────────
      const params = new URLSearchParams({
        identity: deviceInfo.identity,
        password: deviceInfo.password,
        unique_id: deviceInfo.unique_id,
        player_type: deviceInfo.player_type,
        device: deviceInfo.device,
        manufacturer: deviceInfo.manufacturer,
        model: deviceInfo.model,
        os: deviceInfo.os,
        os_version: deviceInfo.os_version,
        app: deviceInfo.app,
        app_version: deviceInfo.app_version,
        recharge_pin: deviceInfo.recharge_pin || '',
      });

      console.log('[Auth] Guest login params:', params.toString());

      // ─────────────────────────────────────────
      // API CALL
      // ─────────────────────────────────────────
      const response = await apiClient.get<any>(
        `${API_ENDPOINTS.GUEST_LOGIN}?${params.toString()}`,
        {
          baseURL: getApiBaseUrl(isHubConnected),
          headers: await getAndroidHeaders({ includeFma: true, deviceInfo }),
        }
      );

      console.log('[Auth] Raw API response:', JSON.stringify(response, null, 2));

      // Save raw response for debugging
      await AsyncStorage.setItem('login_response', JSON.stringify(response));

      // ─────────────────────────────────────────
      // VALIDATE RESPONSE STRUCTURE
      // ─────────────────────────────────────────
      if (!response || !response.status) {
        throw new Error('Invalid API response');
      }

      console.log('[Auth] Status Code:', response.status.code);
      console.log('[Auth] Status Message:', response.status.message);

      if (response.status.code !== 0) {
        throw new Error(response.status.message || 'Login failed');
      }

      if (!response.data) {
        throw new Error('Missing data in response');
      }

      // ─────────────────────────────────────────
      // EXTRACT DATA
      // ─────────────────────────────────────────
      const token = response.data.token;
      const userId = response.data.user_id || deviceInfo.unique_id || deviceInfo.identity || 'offline_guest_id';

      console.log('[Auth] Token:', token?.substring(0, 50) + '...');
      console.log('[Auth] User ID:', userId);

      // 🔥 DEBUG EXPIRY (IMPORTANT)
      console.log('[Auth] Raw expiry value:', response.data.token_expiry_time);

      // ─────────────────────────────────────────
      // SAFE EXPIRY HANDLING (FIXED)
      // ─────────────────────────────────────────
      const expiry = safeParseDate(response.data.token_expiry_time);

      // ─────────────────────────────────────────
      // RETURN TRANSFORMED OBJECT
      // ─────────────────────────────────────────
      const authResponse: AuthResponse = {
        user_id: userId,
        password: response.data.password || '',
        token: token,
        token_expiry_times: expiry,
        enc_accounting: response.data.enc_accounting || '',
        plan: {
          name: response.data.plan_name || 'Free Plan',
          expiry: expiry,
        },
      };

      console.log('[Auth] Final AuthResponse:', authResponse);

      return authResponse;

    } catch (error: any) {

      console.error('[Auth] Guest login error:', error);
      console.error('[Auth] Error details:', error?.response?.data);

      // Save error for debugging
      await AsyncStorage.setItem('login_error', JSON.stringify(error));

      throw error;
    }
  }
}

// ─────────────────────────────────────────────
// EXPORT INSTANCE
// ─────────────────────────────────────────────
export const authRemoteDataSource = new AuthRemoteDataSource();
