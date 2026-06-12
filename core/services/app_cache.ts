import AsyncStorage from '@react-native-async-storage/async-storage';
import { databaseHelper } from '../database/database_helper';
import { deleteAllLocalDownloads } from './DownloadService';
import { useProfileStore } from '../../features/profile/presentation/providers/profile_provider';
import { useMoviesStore } from '../../features/movies/presentation/providers/movies_provider';
import { useRoutersStore } from '../../features/routers/presentation/providers/routers_provider';
import { useDownloadsStore } from '../../features/downloads/presentation/providers/downloads_provider';
import { useHubStore } from '../../features/hub/presentation/providers/hub_provider';

export async function clearAllAppCache(): Promise<void> {
  await deleteAllLocalDownloads();
  await databaseHelper.clearAllCachedData();
  await AsyncStorage.clear();

  useProfileStore.getState().clearProfile();
  useMoviesStore.setState({
    movies: [],
    isLoading: false,
    isRefreshing: false,
    isSyncing: false,
    error: null,
  });
  useRoutersStore.setState({
    routers: [],
    isLoading: false,
    isRefreshing: false,
    isSyncing: false,
    error: null,
  });
  useDownloadsStore.setState({
    downloads: [],
    isProcessingPending: false,
  });
  useHubStore.getState().clearHub();
}
