import { apiClient } from '../../../../core/network/api_client';
import { STORAGE_KEYS, API_ENDPOINTS, getApiBaseUrl } from '../../../../core/constants/api_constants';
import { ProfileResponse } from '../../domain/entities/profile';
import { storageHelper } from '../../../../core/utils/storage_helper';
import { getAndroidHeaders } from '../../../../core/network/auth_headers';

function unwrapProfileResponse(response: any): ProfileResponse | null {
  const payload = response?.data ?? response;

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (payload.data && typeof payload.data === 'object') {
    return payload.data as ProfileResponse;
  }

  if (payload.user_id || payload.name || payload.account || payload.account_id || payload.plan_name) {
    return payload as ProfileResponse;
  }

  return null;
}

export class ProfileRemoteDataSource {
  /**
   * Fetches profile from /fag/account/profile.
   */
 async getProfile(isHubConnected: boolean): Promise<ProfileResponse | null> {
    try {
      const headers = await getAndroidHeaders({ includeAuth: true, includeFma: true });
      if (!headers.Authentication) {
        console.warn('[ProfileRemote] No auth token available');
        return null;
      }

      console.log(`[ProfileRemote] Fetching profile... (Hub: ${isHubConnected})`);

      // ✅ Get the dynamic base URL (Cloud vs Hub)
      // const dynamicBaseUrl = getBaseUrl(isHubConnected);
      console.log(`[ProfileRemote] Fetching profile from API... (url: ${API_ENDPOINTS.GET_ACCOUNT})`);
      // ✅ Override the baseURL for this specific request
      // const response = await apiClient.get<any>('/fag/account/profile', { 
      //   headers,
      //   baseURL: API_ENDPOINTS 
      // });
      const response = await apiClient.get<any>(API_ENDPOINTS.GET_ACCOUNT, {
        headers,
        baseURL: getApiBaseUrl(isHubConnected),
      });

      const profile = unwrapProfileResponse(response);
      if (profile) {
        if (profile.enc_accounting) {
          await storageHelper.setItem(STORAGE_KEYS.ENC_ACCOUNTING, profile.enc_accounting);
        }
        console.log('[ProfileRemote] Fetched profile from API:', {
          user_id: profile.user_id,
          name: profile.name,
          surname: profile.surname,
          account: profile.account,
          account_id: profile.account_id,
          balance: profile.balance,
          plan_name: profile.plan_name,
          available_downloads: profile.available_downloads,
        });
        return profile;
      }

      return null;
    } catch (error) {
      console.error('[ProfileRemote] getProfile error:', error);
      throw error;
    }
  }
}

export const profileRemoteDataSource = new ProfileRemoteDataSource();
