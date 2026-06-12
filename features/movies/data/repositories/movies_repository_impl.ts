// import { MovieResponse } from '../../domain/entities/movie';
// import { moviesRemoteDataSource } from '../datasources/movies_remote_datasource';
// import { moviesLocalDataSource } from '../datasources/movies_local_datasource';

// export class MoviesRepositoryImpl {
//   /**
//    * Offline-first getMovies.
//    *
//    * Returns cached data immediately (Step 1).
//    * Caller should also call backgroundSync() for fresh data (Step 2).
//    */
//   async getCachedMovies(): Promise<MovieResponse[]> {
//     try {
//       const rows = await moviesLocalDataSource.getMovies(500, 0);
//       return moviesLocalDataSource.mapToResponse(rows);
//     } catch (error) {
//       console.error('[MoviesRepo] getCachedMovies error:', error);
//       return [];
//     }
//   }

//   /**
//    * Fetch from API, save to local DB, return fresh list.
//    * Never throws — returns [] on error so cached data is preserved.
//    */
//   async syncFromApi(isHubConnected: boolean): Promise<MovieResponse[]> {
//     try {
//       console.log(`[MoviesRepo] Syncing movies from API... (Hub: ${isHubConnected})`);
//       const fresh = await moviesRemoteDataSource.getMovies();
//       if (fresh.length > 0) {
//        await moviesLocalDataSource.saveMovies(fresh, isHubConnected);
//        console.log(`[MoviesRepo] Saved ${fresh.length} movies to cache`);
//       }
//       return fresh;
//     } catch (error) {
//       console.warn('[MoviesRepo] API sync failed (offline?), keeping cache:', error);
//       return [];
//     }
//   }
  
//   // Inside movies_repository_impl.ts


//   /**
//    * Legacy method: cache-first with blocking API fetch if no cache.
//    * Kept for backward compatibility.
//    */
//   async getMovies(isHubConnected: boolean,forceRefresh = false): Promise<MovieResponse[]> {
//     if (!forceRefresh) {
//       const cached = await this.getCachedMovies();
//       if (cached.length > 0) return cached;
//     }
//     const fresh = await this.syncFromApi(isHubConnected);
//     if (fresh.length > 0) return fresh;
//     return this.getCachedMovies();
//   }

//   // Inside movies_remote_datasource.ts


//   async getHotMovies(): Promise<MovieResponse[]> {
//     try {
//       return await moviesRemoteDataSource.getHotMovies();
//     } catch {
//       const cached = await this.getCachedMovies();
//       return cached.slice(0, 10);
//     }
//   }

//   async getRecommendations(): Promise<MovieResponse[]> {
//     try {
//       return await moviesRemoteDataSource.getRecommendations();
//     } catch {
//       return [];
//     }
//   }

//   async searchMovies(query: string): Promise<MovieResponse[]> {
//     try {
//       const rows = await moviesLocalDataSource.searchMovies(query);
//       return moviesLocalDataSource.mapToResponse(rows);
//     } catch {
//       return [];
//     }
//   }
// }

// export const moviesRepository = new MoviesRepositoryImpl();
import { MovieResponse } from '../../domain/entities/movie';
import { moviesRemoteDataSource } from '../datasources/movies_remote_datasource';
import { moviesLocalDataSource } from '../datasources/movies_local_datasource';

export class MoviesRepositoryImpl {
  /**
   * Offline-first getMovies.
   *
   * Returns cached data immediately (Step 1).
   * Caller should also call backgroundSync() for fresh data (Step 2).
   */
  async getCachedMovies(): Promise<MovieResponse[]> {
    try {
      const rows = await moviesLocalDataSource.getMovies(500, 0);
      return moviesLocalDataSource.mapToResponse(rows);
    } catch (error) {
      console.error('[MoviesRepo] getCachedMovies error:', error);
      return [];
    }
  }

  /**
   * Fetch from API, save to local DB, return fresh list.
   * Never throws — returns [] on error so cached data is preserved.
   */
  async syncFromApi(isHubConnected: boolean): Promise<MovieResponse[]> {
    try {
      console.log(`[MoviesRepo] Syncing movies from API... (Hub: ${isHubConnected})`);
      
      // 🔥 CRITICAL FIX: Passing the connection state to the remote data source
      // This tells the network layer to target the Hub API instead of letting the request time out.
      const fresh = await moviesRemoteDataSource.getMovies(isHubConnected);
      
      if (fresh.length > 0) {
        try {
          await moviesLocalDataSource.saveMovies(fresh, isHubConnected);
          console.log(`[MoviesRepo] Saved ${fresh.length} movies to cache`);
        } catch (cacheError) {
          console.warn('[MoviesRepo] Movie cache save skipped:', cacheError);
        }
      }
      return fresh;
    } catch (error) {
      console.warn('[MoviesRepo] API sync failed (offline?), keeping cache:', error);
      return [];
    }
  }

  /**
   * Legacy method: cache-first with blocking API fetch if no cache.
   * Kept for backward compatibility.
   */
  async getMovies(isHubConnected: boolean, forceRefresh = false): Promise<MovieResponse[]> {
    if (!forceRefresh) {
      const cached = await this.getCachedMovies();
      if (cached.length > 0) return cached;
    }
    const fresh = await this.syncFromApi(isHubConnected);
    if (fresh.length > 0) return fresh;
    return this.getCachedMovies();
  }

  async getHotMovies(): Promise<MovieResponse[]> {
    try {
      return await moviesRemoteDataSource.getHotMovies();
    } catch {
      const cached = await this.getCachedMovies();
      return cached.slice(0, 10);
    }
  }

  async getRecommendations(): Promise<MovieResponse[]> {
    try {
      return await moviesRemoteDataSource.getRecommendations();
    } catch {
      return [];
    }
  }

  async searchMovies(query: string): Promise<MovieResponse[]> {
    try {
      const rows = await moviesLocalDataSource.searchMovies(query);
      return moviesLocalDataSource.mapToResponse(rows);
    } catch {
      return [];
    }
  }
}

export const moviesRepository = new MoviesRepositoryImpl();
