import { apiClient } from '../../../../core/network/api_client';
import { getApiBaseUrl } from '../../../../core/constants/api_constants';
import { RouterResponse } from '../../domain/entities/router';
import { getAndroidHeaders } from '../../../../core/network/auth_headers';

export class RoutersRemoteDataSource {
  /**
   * Fetches all routers from /fag/routers.
   */
  async getRouters(isHubConnected = false): Promise<RouterResponse[]> {
    try {
      const headers = await getAndroidHeaders({ includeAuth: false, includeFma: false });
      console.log('[RoutersRemote] Fetching routers...');

      const response = await apiClient.get<any>('/fag/routers?longi=0&lati=0', {
        headers,
        baseURL: getApiBaseUrl(isHubConnected),
      });

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
