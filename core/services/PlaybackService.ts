/**
 * PlaybackService.ts
 * 
 * Android-equivalent playback URL builder.
 * Matches PresenterMainImp.java logic.
 * 
 * STEP 3: BUILD PLAYBACK URL (ANDROID STYLE)
 * 
 * Use: movie.defaultQuality.fileName
 * 
 * Build URL:
 *   BASE_URL:88 + fileName + "/" + fileName + ".m3u8"
 * 
 * Example:
 *   fileName = Akili_and_Friends_in_TV_Land
 *   Result: http://konnekt.aistream.tv:88/Akili_and_Friends_in_TV_Land/Akili_and_Friends_in_TV_Land.m3u8
 * 
 * Base URL Selection:
 *   - Hub connected: http://192.168.39.20:4433/
 *   - Hub not connected (CDN): http://konnekt.aistream.tv:88/
 */

import { RandomKeyManager } from './RandomKeyManager';
import { RIGHTS_USER_AGENT } from './DownloadRightsService';
import { getAndroidHeaders } from '../network/auth_headers';

// Base URLs - matching Android exactly
// Always use CDN URL (konnekt.aistream.tv:88) for playback
// Hub connection only matters for get_download_right API, not for playback URL
const CDN_BASE_URL = 'http://konnekt.aistream.tv:88';  // Port 88 for playback.

export interface PlaybackConfig {
  movieId: string | number;
  movieName: string;
  fileName: string;
  isHubConnected: boolean;
}

export interface PlaybackHeaders {
  Authentication: string;
  'User-Agent': string;
  'Fma-Authentication': string;
  Cookie: string;
}

export interface PlaybackResult {
  success: boolean;
  playbackUrl: string;
  baseUrl: string;
  fileName: string;
  isHubConnected: boolean;
  headers: PlaybackHeaders;
  debugInfo: {
    movieId: string | number;
    originalFileName: string;
    normalizedFileName: string;
    baseUrlSelected: string;
    finalUrl: string;
    headersApplied: {
      authentication: string;
      userAgent: string;
      fmaAuthentication: string;
      cookie: string;
    };
  };
}

/**
 * Normalize file name for URL construction.
 * - Trim whitespace
 * - Remove leading slashes
 * - Remove duplicate slashes
 * - Remove file extension if present
 */
function normalizeFileName(fileName: string): string {
  if (!fileName) return '';
  
  let normalized = fileName.trim();
  
  // Remove leading slashes
  normalized = normalized.replace(/^\/+/, '');
  
  // Remove duplicate slashes
  normalized = normalized.replace(/\/+/g, '/');
  
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');
  
  // Remove .m3u8 extension if present (we add it ourselves)
  normalized = normalized.replace(/\.m3u8$/i, '');
  
  // If path contains /, extract just the base folder name
  // e.g., "SintelDemo/SintelDemo" → "SintelDemo"
  if (normalized.includes('/')) {
    const parts = normalized.split('/');
    // Use the first part as the fileName
    normalized = parts[0];
  }
  
  return normalized;
}

/**
 * Normalize base URL.
 * - Remove trailing slash
 */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Build playback headers - must be attached to ALL media requests
 */
async function buildPlaybackHeaders(movieId: string | number): Promise<PlaybackHeaders> {
  const authHeaders = await getAndroidHeaders({ includeAuth: true, includeFma: true });
  
  // Get randomkey from manager
  const randomKey = await RandomKeyManager.getKey(movieId);
  const cookie = randomKey ? RandomKeyManager.formatCookie(randomKey) : '';
  
  return {
    Authentication: authHeaders.Authentication || '',
    'User-Agent': authHeaders['User-Agent'] || RIGHTS_USER_AGENT,
    'Fma-Authentication': authHeaders['Fma-Authentication'] || '',
    Cookie: cookie,
  };
}

/**
 * Mask token for logging
 */
function maskToken(token: string): string {
  if (!token) return 'null';
  if (token.length <= 10) return '***';
  return token.substring(0, 10) + '...';
}

/**
 * Build playback URL following Android PresenterMainImp logic.
 * 
 * @param config - Playback configuration
 * @returns PlaybackResult with final URL, headers, and debug info
 */
export async function buildPlaybackUrl(config: PlaybackConfig): Promise<PlaybackResult> {
  const { movieId, movieName, fileName, isHubConnected } = config;
  
  console.log('========================================');
  console.log('[PlaybackService] STEP 3: Building playback URL');
  
  // Always use CDN URL (demo.aistream.tv:88) for playback
  // Hub connection status doesn't affect playback URL, only the rights check
  const baseUrl = normalizeBaseUrl(CDN_BASE_URL);
  
  console.log('[PlaybackService] Movie ID:', movieId);
  console.log('[PlaybackService] Movie Name:', movieName);
  console.log('[PlaybackService] Original fileName:', fileName);
  console.log('[PlaybackService] isHubConnected:', isHubConnected);
  console.log('[PlaybackService] BASE_URL (always CDN):', baseUrl);
  
  // 2) Normalize fileName
  const normalizedFileName = normalizeFileName(fileName);
  
  if (!normalizedFileName) {
    console.error('[PlaybackService] ERROR: No valid fileName after normalization');
    
    const emptyHeaders: PlaybackHeaders = {
      Authentication: '',
      'User-Agent': RIGHTS_USER_AGENT,
      'Fma-Authentication': '',
      Cookie: '',
    };
    
    return {
      success: false,
      playbackUrl: '',
      baseUrl,
      fileName: normalizedFileName,
      isHubConnected,
      headers: emptyHeaders,
      debugInfo: {
        movieId,
        originalFileName: fileName,
        normalizedFileName,
        baseUrlSelected: baseUrl,
        finalUrl: '',
        headersApplied: {
          authentication: '',
          userAgent: RIGHTS_USER_AGENT,
          fmaAuthentication: '',
          cookie: '',
        },
      },
    };
  }
  
  console.log('[PlaybackService] Normalized fileName:', normalizedFileName);
  
  // 3) Build final URL: base + "/" + fileName + "/" + fileName + ".m3u8"
  const finalUrl = `${baseUrl}/${normalizedFileName}/${normalizedFileName}.m3u8`;
  
  console.log('[PlaybackService] FINAL playback URL:', finalUrl);
  
  // 4) Build playback headers
  const headers = await buildPlaybackHeaders(movieId);
  
  console.log('[PlaybackService] Headers to attach:');
  console.log('  - Authentication:', maskToken(headers.Authentication));
  console.log('  - User-Agent:', headers['User-Agent']);
  console.log('  - Fma-Authentication:', headers['Fma-Authentication']);
  console.log('  - Cookie:', headers.Cookie);
  console.log('========================================');
  
  return {
    success: true,
    playbackUrl: finalUrl,
    baseUrl,
    fileName: normalizedFileName,
    isHubConnected,
    headers,
    debugInfo: {
      movieId,
      originalFileName: fileName,
      normalizedFileName,
      baseUrlSelected: baseUrl,
      finalUrl,
      headersApplied: {
        authentication: maskToken(headers.Authentication),
        userAgent: headers['User-Agent'],
        fmaAuthentication: headers['Fma-Authentication'],
        cookie: headers.Cookie,
      },
    },
  };
}

/**
 * Extract fileName from movie object.
 * Tries multiple fields in order of priority.
 * 
 * Priority (matching Android):
 * 1. movie.quality_list[0]?.file_name (API format - CORRECT!)
 * 2. movie.default_quality?.file_name
 * 3. movie.defaultQuality?.fileName
 * 4. movie.file_name
 * 5. movie.fileName
 * 6. movie.name (fallback - use movie name as folder name)
 */
export function extractFileName(movie: any): string {
  
   console.log('##################### [PlaybackService] Using quality_list[0].file_name:', movie);
  if (!movie) return '';
  
  // Try quality_list[0].file_name (API format - THIS IS THE CORRECT FIELD!)
  if (movie.quality_list && movie.quality_list.length > 0 && movie.quality_list[0]?.file_name) {
    console.log('[PlaybackService] Using quality_list[0].file_name:', movie.quality_list[0].file_name);
    return movie.quality_list[0].file_name;
  }
  
  // Try default_quality.file_name (API format)
  if (movie.default_quality?.file_name) {
    console.log('[PlaybackService] Using default_quality.file_name:', movie.default_quality.file_name);
    return movie.default_quality.file_name;
  }
  
  // Try defaultQuality.fileName (camelCase format)
  if (movie.defaultQuality?.fileName) {
    console.log('[PlaybackService] Using defaultQuality.fileName:', movie.defaultQuality.fileName);
    return movie.defaultQuality.fileName;
  }
  
  // Try direct file_name field
  if (movie.file_name) {
    console.log('[PlaybackService] Using file_name:', movie.file_name);
    return movie.file_name;
  }
  
  // Try direct fileName field
  if (movie.fileName) {
    console.log('[PlaybackService] Using fileName:', movie.fileName);
    return movie.fileName;
  }
  
  // Fallback: derive from movie name
  // Remove special characters and spaces, use as folder name
  if (movie.name) {
    const derived = movie.name
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    console.log('[PlaybackService] Using derived from name:', derived);
    return derived;
  }
  
  return '';
}

/**
 * Main entry point - build playback URL from movie object.
 * 
 * @param movie - Movie object from API
 * @param isHubConnected - Whether hub is connected
 * @returns PlaybackResult
 */
export async function getPlaybackUrl(movie: any, isHubConnected: boolean): Promise<PlaybackResult> {
  const movieId = movie?.movie_id || movie?.movieId || movie?.id || 'unknown';
  const movieName = movie?.name || 'Unknown Movie';
  const fileName = extractFileName(movie);
  
  return buildPlaybackUrl({
    movieId,
    movieName,
    fileName,
    isHubConnected,
  });
}

export { CDN_BASE_URL };
