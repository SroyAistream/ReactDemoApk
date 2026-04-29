/**
 * downloads_provider.ts
 *
 * Zustand store for managing content downloads.
 *
 * States:
 *   pending     – queued but hub not available yet
 *   downloading – actively downloading
 *   completed   – local m3u8 + ts files available
 *   failed      – last attempt failed
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
      const all = await databaseHelper.getDownloads();
      set({ downloads: all });
    } catch (e) {
      console.error('[DownloadsStore] loadDownloads:', e);
    }
  },

  // ── Queue (no hub available) ───────────────────────────────────────────────

  queueDownload: async (movie: any) => {
    const movieId = String(movie?.movie_id ?? movie?.movieId ?? movie?.id);
    const existing = get().downloads.find(d => d.movie_id === movieId);
    // Don't overwrite an active/completed download
    if (existing?.status === 'completed' || existing?.status === 'downloading') return;

    await databaseHelper.saveDownload({
      movie_id: movieId,
      name: movie?.name ?? 'Unknown',
      status: 'pending',
      progress: 0,
      movie_json: JSON.stringify(movie),
    });
    await get().loadDownloads();
  },

  // ── Start immediate download (hub connected) ───────────────────────────────

  startDownload: async (movie: any, isHubConnected: boolean) => {
    await ensureDb(databaseHelper);
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
    downloadMovie(movie, isHubConnected, (progress) => {
      set(state => ({
        downloads: state.downloads.map(d =>
          d.movie_id === movieId
            ? { ...d, status: progress.status as DownloadStatus, progress: progress.progress }
            : d
        ),
      }));
    })
      .then(() => get().loadDownloads())
      .catch(() => get().loadDownloads());
  },

  // ── Process all pending downloads (called on hub connect / app launch) ─────

  processPendingDownloads: async (isHubConnected: boolean) => {
    if (!isHubConnected) {
      console.log('[DownloadsStore] Hub not connected – skipping pending downloads');
      return;
    }
    if (get().isProcessingPending) return;

    set({ isProcessingPending: true });
    try {
      const pending = await databaseHelper.getPendingDownloads();
      console.log(`[DownloadsStore] Processing ${pending.length} pending download(s)`);
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

  // ── Queries ────────────────────────────────────────────────────────────────

  getDownloadByMovieId: (movieId: string | number) =>
    get().downloads.find(d => d.movie_id === String(movieId)),

  getLocalPath: (movieId: string | number) => getLocalPlaybackPath(movieId),

  // ── Delete ─────────────────────────────────────────────────────────────────

  removeDownload: async (movieId: string | number) => {
    await deleteLocalDownload(movieId);
    await databaseHelper.deleteDownload(movieId);
    await get().loadDownloads();
  },
}));
