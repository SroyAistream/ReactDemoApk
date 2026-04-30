/**
 * downloads_provider.ts
 *
 * Fixed: Removed redundant local init logic and synced with 
 * the public databaseHelper Gatekeeper pattern.
 */

import { create } from 'zustand';
import { databaseHelper } from '../../../../core/database/database_helper';
import {
  downloadMovie,
  getLocalPlaybackPath,
  deleteLocalDownload,
} from '../../../../core/services/DownloadService';
import { DownloadItem, DownloadStatus } from '../../domain/entities/download';

interface DownloadsState {
  downloads: DownloadItem[];
  isProcessingPending: boolean;

  loadDownloads: () => Promise<void>;
  queueDownload: (movie: any) => Promise<void>;
  startDownload: (movie: any, isHubConnected: boolean) => Promise<void>;
  processPendingDownloads: (isHubConnected: boolean) => Promise<void>;
  getDownloadByMovieId: (movieId: string | number) => DownloadItem | undefined;
  getLocalPath: (movieId: string | number) => Promise<string | null>;
  removeDownload: (movieId: string | number) => Promise<void>;
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  downloads: [],
  isProcessingPending: false,

  // ── Load from DB ───────────────────────────────────────────────────────────

  loadDownloads: async () => {
    try {
      // Use the helper's gatekeeper to ensure readiness
      await databaseHelper.ensureDB();
      const all = await databaseHelper.getDownloads();
      set({ downloads: all });
    } catch (e) {
      console.error('[DownloadsStore] loadDownloads error:', e);
    }
  },

  // ── Queue (no hub available) ───────────────────────────────────────────────

  queueDownload: async (movie: any) => {
    try {
      await databaseHelper.ensureDB();
      const movieId = String(movie?.movie_id ?? movie?.movieId ?? movie?.id);
      const existing = get().downloads.find(d => d.movie_id === movieId);
      
      if (existing?.status === 'completed' || existing?.status === 'downloading') return;

      await databaseHelper.saveDownload({
        movie_id: movieId,
        name: movie?.name ?? 'Unknown',
        status: 'pending',
        progress: 0,
        movie_json: JSON.stringify(movie),
      });
      await get().loadDownloads();
    } catch (e) {
      console.error('[DownloadsStore] queueDownload error:', e);
    }
  },

  // ── Start immediate download (hub connected) ───────────────────────────────

  startDownload: async (movie: any, isHubConnected: boolean) => {
    try {
      // Fix: Strictly await the global Gatekeeper
      await databaseHelper.ensureDB();
      
      const movieId = String(movie?.movie_id ?? movie?.movieId ?? movie?.id);

      const existing = get().downloads.find(d => d.movie_id === movieId);
      if (existing?.status === 'downloading' || existing?.status === 'completed') return;

      // Persist 'downloading' state immediately
      await databaseHelper.saveDownload({
        movie_id: movieId,
        name: movie?.name ?? 'Unknown',
        status: 'downloading',
        progress: 0,
        movie_json: JSON.stringify(movie),
      });
      await get().loadDownloads();

      // Fire-and-forget — progress updates arrive via callback
      // downloadMovie(movie, isHubConnected, (progress) => {
      //   set(state => ({
      //     downloads: state.downloads.map(d =>
      //       d.movie_id === movieId
      //         ? { 
      //             ...d, 
      //             status: progress.status as DownloadStatus, 
      //             progress: progress.progress,
      //             local_path: progress.localPath || d.local_path
      //           }
      //         : d
      //     ),
      //   }));
      // })
     downloadMovie(movie, isHubConnected, (progressData) => {
      set((state) => {
        const updatedDownloads = state.downloads.map((d) =>
          d.movie_id === String(movieId)
            ? { 
                ...d, 
                status: progressData.status as DownloadStatus, 
                progress: progressData.progress, // Ensure this is the raw 0.0 - 1.0 value
                local_path: progressData.localPath || d.local_path 
              }
            : d
        );
        return { downloads: updatedDownloads };
      });
    })
      .then(() => get().loadDownloads())
      .catch((err) => {
        console.error(`[DownloadsStore] Download failed for ${movieId}:`, err);
        get().loadDownloads();
      });
    } catch (e) {
      console.error('[DownloadsStore] startDownload error:', e);
    }
  },

  // ... (rest of the store remains the same)
  
  processPendingDownloads: async (isHubConnected: boolean) => {
    if (!isHubConnected) return;
    if (get().isProcessingPending) return;

    set({ isProcessingPending: true });
    try {
      await databaseHelper.ensureDB();
      const pending = await databaseHelper.getPendingDownloads();
      for (const item of pending) {
        if (!item.movie_json) continue;
        try {
          const movie = JSON.parse(item.movie_json);
          await get().startDownload(movie, isHubConnected);
        } catch (e) {
          console.warn('[DownloadsStore] Skipped pending download:', item.movie_id, e);
        }
      }
    } catch (e) {
      console.error('[DownloadsStore] processPendingDownloads:', e);
    } finally {
      set({ isProcessingPending: false });
    }
  },

  getDownloadByMovieId: (movieId: string | number) =>
    get().downloads.find(d => d.movie_id === String(movieId)),

  getLocalPath: (movieId: string | number) => getLocalPlaybackPath(movieId),

  removeDownload: async (movieId: string | number) => {
    try {
      await databaseHelper.ensureDB();
      await deleteLocalDownload(movieId);
      await databaseHelper.deleteDownload(movieId);
      await get().loadDownloads();
    } catch (e) {
      console.error('[DownloadsStore] removeDownload error:', e);
    }
  },
}));