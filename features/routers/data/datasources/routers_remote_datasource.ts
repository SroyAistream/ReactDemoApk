import { apiClient } from '../../../../core/network/api_client';
import { STORAGE_KEYS } from '../../../../core/constants/api_constants';
import { RouterResponse } from '../../domain/entities/router';
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

export class RoutersRemoteDataSource {
  /**
   * Fetches all routers from /fag/routers.
   */
  async getRouters(): Promise<RouterResponse[]> {
    try {
      const headers = await getAuthHeaders();
      console.log('[RoutersRemote] Fetching routers...');

      const response = await apiClient.get<any>('/fag/routers', { headers });

      // Handle {status, data:[]} or bare []
      const list: RouterResponse[] = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];

      console.log(`[RoutersRemote] Fetched ${list.length} routers from API`);
      return list;
    } catch (error) {
      console.error('[RoutersRemote] getRouters error:', error);
      throw error;
    }
  }
}

export const routersRemoteDataSource = new RoutersRemoteDataSource();
