import { Router, RouterResponse } from '../../domain/entities/router';
import { routersRemoteDataSource } from '../datasources/routers_remote_datasource';
import { routersLocalDataSource } from '../datasources/routers_local_datasource';

let syncPromise: Promise<Router[]> | null = null;

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
  async syncFromApi(isHubConnected: boolean): Promise<Router[]> {
    if (syncPromise) return syncPromise;

    syncPromise = this.doSyncFromApi(isHubConnected).finally(() => {
      syncPromise = null;
    });

    return syncPromise;
  }

  private async doSyncFromApi(isHubConnected: boolean): Promise<Router[]> {
    try {
      console.log(`[RoutersRepo] Syncing routers from API...(Hub: ${isHubConnected})`);
      const fresh = await routersRemoteDataSource.getRouters(isHubConnected);
      if (fresh.length > 0) {
        try {
          await routersLocalDataSource.saveRouters(fresh,isHubConnected);
          console.log(`[RoutersRepo] Saved ${fresh.length} routers to cache`);
        } catch (cacheError) {
          console.warn('[RoutersRepo] Router cache save skipped:', cacheError);
        }
      }
      return fresh as Router[];
    } catch (error) {
      console.warn('[RoutersRepo] API sync failed (offline?), keeping cache:', error);
      return [];
    }
  }

  /**
   * Legacy method: cache-first with blocking API fetch if no cache.
   */
  async getRouters(isHubConnected: boolean,forceRefresh = false): Promise<Router[]> {
    if (!forceRefresh) {
      const cached = await this.getCachedRouters();
      if (cached.length > 0) return cached;
    }
    const fresh = await this.syncFromApi(isHubConnected);
    if (fresh.length > 0) return fresh;
    return this.getCachedRouters();
  }
}

export const routersRepository = new RoutersRepositoryImpl();
