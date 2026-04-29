import { apiClient } from '../../../../core/network/api_client';
import { STORAGE_KEYS,API_ENDPOINTS } from '../../../../core/constants/api_constants';
import { ProfileResponse } from '../../domain/entities/profile';
import { storageHelper } from '../../../../core/utils/storage_helper';
/**
 * Builds the Authentication header using stored Bearer token.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await storageHelper.getItem(STORAGE_KEYS.TOKEN);
  if (token) {
    return { Authentication: `Bearer ${token}` };
  }
  return {};
}

export class ProfileRemoteDataSource {
  /**
   * Fetches profile from /fag/account/profile.
   */
 async getProfile(isHubConnected: boolean): Promise<ProfileResponse | null> {
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authentication) {
        console.warn('[ProfileRemote] No auth token available');
        return null;
      }

      console.log(`[ProfileRemote] Fetching profile... (Hub: ${isHubConnected})`);

      // ✅ Get the dynamic base URL (Cloud vs Hub)
      // const dynamicBaseUrl = getBaseUrl(isHubConnected);
 console.log(`[ProfileRemote] Fetching profile from API... (url: ${API_ENDPOINTS})`);
      // ✅ Override the baseURL for this specific request
      // const response = await apiClient.get<any>('/fag/account/profile', { 
      //   headers,
      //   baseURL: API_ENDPOINTS 
      // });
      const response =  await apiClient.get<any>(API_ENDPOINTS.GET_ACCOUNT, { headers })

      // Handle {status, data: {...}} wrapper
      if (response?.data) {
        console.log('[ProfileRemote] Fetched profile from API');
        return response.data as ProfileResponse;
      }

      // Direct response
      if (response?.user_id || response?.name) {
        return response as ProfileResponse;
      }

      return null;
    } catch (error) {
      console.error('[ProfileRemote] getProfile error:', error);
      throw error;
    }
  }
}

export const profileRemoteDataSource = new ProfileRemoteDataSource();
