/**
 * DownloadService.ts
 *
 * Downloads HLS content (m3u8 + ts segments) to local device storage.
 *
 * Flow:
 *   1. checkDownloadRights → get randomKey / cookie
 *   2. getPlaybackUrl      → build m3u8 URL + auth headers
 *   3. Fetch m3u8 manifest (follows master → variant if needed)
 *   4. Download every .ts segment via expo-file-system
 *   5. Write a local m3u8 manifest pointing to local segment paths
 *   6. Save local_path in DB, mark status = 'completed'
 *
 * Cookie expiry: randomKey is valid for 10 min (RandomKeyManager).
 * The rights are re-fetched at the start of every download call.
 */

import { Platform } from 'react-native';
import {
  checkDownloadRights,
  STATUS_CODES,
  getDeviceId,
  RIGHTS_USER_AGENT,
} from './DownloadRightsService';
import { getPlaybackUrl } from './PlaybackService';
import { databaseHelper } from '../database/database_helper';
import { storageHelper } from '../utils/storage_helper';
import { STORAGE_KEYS } from '../constants/api_constants';
import { RandomKeyManager } from './RandomKeyManager';
import * as FileSystemLegacy from 'expo-file-system/legacy';
// ─── Types ────────────────────────────────────────────────────────────────────

export interface DownloadProgress {
  movieId: string | number;
  progress: number; // 0 – 1
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  localPath?: string;
}

export type DownloadProgressCallback = (p: DownloadProgress) => void;

// ─── Constants ────────────────────────────────────────────────────────────────

const DOWNLOAD_SUBDIR = 'aistream_downloads';

// ─── FileSystem lazy-loader (native only) ────────────────────────────────────

let _FS: any = null;

// function getFS(): any | null {
//   if (Platform.OS === 'web') return null;
//   if (!_FS) {
//     try {
//       _FS = require('expo-file-system');
//     } catch {
//       return null;
//     }
//   }
//   return _FS;
// }
function getFS(): any | null {
  if (Platform.OS === 'web') return null;
  return FileSystemLegacy; // ✅ ALWAYS use legacy
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function buildHeaders(movieId: string | number): Promise<Record<string, string>> {
  const token = await storageHelper.getItem(STORAGE_KEYS.TOKEN);
  const deviceId = await getDeviceId();
  const fmaPayload = { device_id: deviceId, player_type: '2000', enc_accounting: '' };
  const fmaAuth = `Bearer ${JSON.stringify(fmaPayload)}`;
  const randomKey = await RandomKeyManager.getKey(movieId);
  const cookie = randomKey ? RandomKeyManager.formatCookie(randomKey) : '';

  return {
    Authentication: token ? `Bearer ${token}` : '',
    'User-Agent': RIGHTS_USER_AGENT,
    'Fma-Authentication': fmaAuth,
    Cookie: cookie,
  };
}

/**
 * Parse a playlist and return either segment URLs (.ts/.aac/.mp4)
 * or a variant playlist URL (.m3u8) if this is a master manifest.
 */
function parsePlaylist(
  content: string,
  manifestUrl: string
): { segments: string[]; variantUrl: string | null } {
  const baseDir = manifestUrl.substring(0, manifestUrl.lastIndexOf('/') + 1);
  const segments: string[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const resolved = line.startsWith('http') ? line : baseDir + line;

    if (line.endsWith('.m3u8') || line.includes('.m3u8?')) {
      return { segments: [], variantUrl: resolved };
    }
    if (
      line.endsWith('.ts') ||
      line.includes('.ts?') ||
      line.endsWith('.aac') ||
      line.endsWith('.mp4')
    ) {
      segments.push(resolved);
    }
  }
  return { segments, variantUrl: null };
}

async function ensureDir(FS: any, movieId: string | number): Promise<string> {
  const dir = `${FS.documentDirectory}${DOWNLOAD_SUBDIR}/${String(movieId)}/`;
  const info = await FileSystemLegacy.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystemLegacy.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Download a movie's HLS content to local storage.
 */
export async function downloadMovie(
  movie: any,
  isHubConnected: boolean,
  onProgress?: DownloadProgressCallback
): Promise<{ success: boolean; message: string; localPath?: string }> {
  const FS = getFS();
  if (!FS) {
    return { success: false, message: 'Downloads not supported on this platform' };
  }

  const movieId = movie?.movie_id ?? movie?.movieId ?? movie?.id;

  try {
    // ── Step 1: Mark as downloading ─────────────────────────────────────────
    await databaseHelper.updateDownloadStatus(movieId, 'downloading', 0);
    onProgress?.({ movieId, progress: 0, status: 'downloading' });

    // ── Step 2: Rights check → store randomKey ───────────────────────────────
    console.log('[DownloadService] Checking rights for movie:', movieId);
    const rights = await checkDownloadRights(movieId, isHubConnected);
    if (rights.statusCode !== STATUS_CODES.OK) {
      await databaseHelper.updateDownloadStatus(movieId, 'failed', 0);
      onProgress?.({ movieId, progress: 0, status: 'failed' });
      return { success: false, message: rights.message || 'Rights check failed' };
    }
    console.log('[DownloadService] Rights OK, randomKey:', rights.randomKey);

    // ── Step 3: Build m3u8 URL + headers ────────────────────────────────────
    const playbackResult = await getPlaybackUrl(movie, isHubConnected);
    if (!playbackResult.success || !playbackResult.playbackUrl) {
      await databaseHelper.updateDownloadStatus(movieId, 'failed', 0);
      onProgress?.({ movieId, progress: 0, status: 'failed' });
      return { success: false, message: 'Could not build playback URL' };
    }

    const m3u8Url = playbackResult.playbackUrl;
    const headers = await buildHeaders(movieId);
    console.log('[DownloadService] Fetching manifest:', m3u8Url);

    // ── Step 4: Fetch manifest ───────────────────────────────────────────────
    const manifestResp = await fetch(m3u8Url, { headers: headers as any });
    if (!manifestResp.ok) {
      await databaseHelper.updateDownloadStatus(movieId, 'failed', 0);
      onProgress?.({ movieId, progress: 0, status: 'failed' });
      return { success: false, message: `Failed to fetch manifest (HTTP ${manifestResp.status})` };
    }
    const manifestContent = await manifestResp.text();

    // ── Step 5: Parse segments (resolve master → variant if needed) ──────────
    let { segments, variantUrl } = parsePlaylist(manifestContent, m3u8Url);

    if (variantUrl) {
      console.log('[DownloadService] Master manifest → fetching variant:', variantUrl);
      const variantResp = await fetch(variantUrl, { headers: headers as any });
      if (variantResp.ok) {
        const variantContent = await variantResp.text();
        const parsed = parsePlaylist(variantContent, variantUrl);
        segments = parsed.segments;
      }
    }

    if (segments.length === 0) {
      await databaseHelper.updateDownloadStatus(movieId, 'failed', 0);
      onProgress?.({ movieId, progress: 0, status: 'failed' });
      return { success: false, message: 'No video segments found in manifest' };
    }
    console.log('[DownloadService]', segments.length, 'segments to download');

    // ── Step 6: Prepare local directory ────────────────────────────────────
    const movieDir = await ensureDir(FS, movieId);
    const downloadedNames: string[] = [];

    // ── Step 7: Download each .ts segment ──────────────────────────────────
    for (let i = 0; i < segments.length; i++) {
      const segUrl = segments[i];
      const segName = `seg_${String(i).padStart(5, '0')}.ts`;
      const localPath = movieDir + segName;

      try {
        const result = await FileSystemLegacy.downloadAsync(segUrl, localPath, { headers });
        if (result.status === 200) {
          downloadedNames.push(segName);
        } else {
          console.warn('[DownloadService] Segment', i, 'HTTP', result.status);
        }
      } catch (segErr) {
        console.warn('[DownloadService] Segment', i, 'failed:', segErr);
      }

      const progress = (i + 1) / segments.length;
      await databaseHelper.updateDownloadStatus(movieId, 'downloading', progress);
      onProgress?.({ movieId, progress, status: 'downloading' });
    }

    if (downloadedNames.length === 0) {
      await databaseHelper.updateDownloadStatus(movieId, 'failed', 0);
      onProgress?.({ movieId, progress: 0, status: 'failed' });
      return { success: false, message: 'All segments failed to download' };
    }

    // ── Step 8: Write local m3u8 manifest ──────────────────────────────────
    const m3u8Lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:10',
      '#EXT-X-MEDIA-SEQUENCE:0',
    ];
    for (const segFile of downloadedNames) {
      m3u8Lines.push('#EXTINF:10.0,');
      m3u8Lines.push(movieDir + segFile);
    }
    m3u8Lines.push('#EXT-X-ENDLIST');

    const localM3u8Path = movieDir + 'index.m3u8';
    await FS.writeAsStringAsync(localM3u8Path, m3u8Lines.join('\n'));

    // ── Step 9: Mark completed ──────────────────────────────────────────────
    await databaseHelper.updateDownloadStatus(movieId, 'completed', 1, localM3u8Path);
    onProgress?.({ movieId, progress: 1, status: 'completed' });

    console.log('[DownloadService] Complete –', downloadedNames.length, '/', segments.length, 'segs →', localM3u8Path);
    return { success: true, message: `Downloaded ${downloadedNames.length} segments`, localPath: localM3u8Path };

  } catch (error: any) {
    console.error('[DownloadService] Error:', error);
    await databaseHelper.updateDownloadStatus(movieId, 'failed', 0);
    onProgress?.({ movieId, progress: 0, status: 'failed' });
    return { success: false, message: error.message || 'Download failed' };
  }
}

/**
 * Return the local m3u8 path for a completed download, or null if not available.
 */
export async function getLocalPlaybackPath(movieId: string | number): Promise<string | null> {
  try {
    const download = await databaseHelper.getDownloadByMovieId(movieId);
    if (download?.status === 'completed' && download?.local_path) {
      const FS = getFS();
      if (!FS) return null;
      const info = await FileSystemLegacy.getInfoAsync(download.local_path);
      if (info.exists) return download.local_path;
      // File was deleted externally – reset status
      await databaseHelper.updateDownloadStatus(movieId, 'failed', 0);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Delete all downloaded files for a movie.
 */
export async function deleteLocalDownload(movieId: string | number): Promise<void> {
  try {
    const FS = getFS();
    if (!FS) return;
    const download = await databaseHelper.getDownloadByMovieId(movieId);
    if (download?.local_path) {
      const dir = download.local_path.substring(0, download.local_path.lastIndexOf('/') + 1);
      const info = await FileSystemLegacy.getInfoAsync(dir);
      if (info.exists) await FS.deleteAsync(dir, { idempotent: true });
    }
  } catch (err) {
    console.warn('[DownloadService] deleteLocalDownload error:', err);
  }
}

/**
 * Delete every locally downloaded movie file managed by this app.
 */
export async function deleteAllLocalDownloads(): Promise<void> {
  try {
    const FS = getFS();
    if (!FS) return;
    const dir = `${FS.documentDirectory}${DOWNLOAD_SUBDIR}/`;
    const info = await FileSystemLegacy.getInfoAsync(dir);
    if (info.exists) {
      await FS.deleteAsync(dir, { idempotent: true });
    }
  } catch (err) {
    console.warn('[DownloadService] deleteAllLocalDownloads error:', err);
  }
}
