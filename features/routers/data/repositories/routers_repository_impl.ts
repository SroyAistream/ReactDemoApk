import { Router, RouterResponse } from '../../domain/entities/router';
import { routersRemoteDataSource } from '../datasources/routers_remote_datasource';
import { routersLocalDataSource } from '../datasources/routers_local_datasource';

export class RoutersRepositoryImpl {
  /**
   * Offline-first getCachedRouters.
   *
   * Returns cached data immediately (Step 1).
   * Caller should also call syncFromApi() for fresh data (Step 2).
   */
  async getCachedRouters(): Promise<Router[]> {
    try {
      return await routersLocalDataSource.getRouters();
    } catch (error) {
      console.error('[RoutersRepo] getCachedRouters error:', error);
      return [];
    }
  }

  /**
   * Fetch from API, save to local DB, return fresh list.
   * Never throws — returns [] on error so cached data is preserved.
   */
  async syncFromApi(): Promise<Router[]> {
    try {
      console.log('[RoutersRepo] Syncing routers from API...');
      const fresh = await routersRemoteDataSource.getRouters();
      if (fresh.length > 0) {
        await routersLocalDataSource.saveRouters(fresh);
        console.log(`[RoutersRepo] Saved ${fresh.length} routers to cache`);
      }
      // Return mapped entities
      return await routersLocalDataSource.getRouters();
    } catch (error) {
      console.warn('[RoutersRepo] API sync failed (offline?), keeping cache:', error);
      return [];
    }
  }

  /**
   * Legacy method: cache-first with blocking API fetch if no cache.
   */
  async getRouters(forceRefresh = false): Promise<Router[]> {
    if (!forceRefresh) {
      const cached = await this.getCachedRouters();
      if (cached.length > 0) return cached;
    }
    const fresh = await this.syncFromApi();
    if (fresh.length > 0) return fresh;
    return this.getCachedRouters();
  }
}

export const routersRepository = new RoutersRepositoryImpl();
