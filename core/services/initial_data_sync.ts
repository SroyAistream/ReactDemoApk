import { moviesRepository } from '../../features/movies/data/repositories/movies_repository_impl';
import { routersRepository } from '../../features/routers/data/repositories/routers_repository_impl';
import { profileRepository } from '../../features/profile/data/repositories/profile_repository_impl';

let bootstrapPromise: Promise<void> | null = null;

export async function syncInitialDataAfterLogin(isHubConnected: boolean): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    console.log('[InitialSync] Starting post-login data sync...');

    const results = await Promise.allSettled([
      moviesRepository.syncFromApi(isHubConnected),
      routersRepository.syncFromApi(isHubConnected),
      profileRepository.syncFromApi(isHubConnected),
    ]);

    results.forEach((result, index) => {
      const labels = ['movies', 'routers', 'profile'];
      if (result.status === 'rejected') {
        console.warn(`[InitialSync] ${labels[index]} sync failed:`, result.reason);
      }
    });

    console.log('[InitialSync] Post-login data sync finished');
  })().finally(() => {
    bootstrapPromise = null;
  });

  return bootstrapPromise;
}
