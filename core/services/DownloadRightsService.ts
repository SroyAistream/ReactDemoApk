/**
 * DownloadRightsService.ts
 * 
 * Android-equivalent get_download_right API call.
 * Must be called before playback to verify user has permission.
 * 
 * IMPORTANT: This API is ONLY available when connected to a Media Hub router.
 * The demo server does NOT have this endpoint.
 * 
 * Endpoint: GET http://{HUB_IP}/get_download_right?id={movie_id}&streaming=0
 * 
 * Required Headers:
 * - Authentication: Bearer {token}
 * - User-Agent: OGLE-APP/Android
 * - Fma-Authentication: Bearer {device_id, player_type, enc_accounting}
 * 
 * Response:
 * - Set-Cookie header contains: randomkey=xxxx (must be extracted and stored)
 * - Body contains: status.code (0=OK, 1=failed, 13=Unrecognizable Wifi Router, etc.)
 * 
 * Randomkey Rules:
 * - Binds to APP IP and movie_id
 * - Expires after 10 minutes
 * - Must revalidate when:
 *   - Reconnecting to router
 *   - New movie selected
 *   - Key expired
 */

import { storageHelper } from '../utils/storage_helper';
import { STORAGE_KEYS } from '../constants/api_constants';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { RandomKeyManager } from './RandomKeyManager';

// User-Agent for rights check (must match Android app)
const RIGHTS_USER_AGENT = 'OGLE-APP/Android';

// Storage key for persistent device ID
const DEVICE_ID_KEY = 'persistent_device_id';

// Rights check API URL (on demo.aistream.tv, but only call when connected to Hub)
// NOTE: Uses HTTPS and only works when request originates from Media Hub network
const RIGHTS_API_URL = 'https://demo.aistream.tv/get_download_right';

// Status code meanings from Android
export const STATUS_CODES = {
  OK: 0,
  FAILED: 1,
  UNRECOGNIZABLE_WIFI_ROUTER: 13,
  UN_PURCHASED_CONTENT: 14,
  WIFI_ROUTER_DISABLED: 16,
  ROUTER_RUN_OUT: 42,
  CONTENT_MISSING: 43,
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  HUB_NOT_CONNECTED: -100, // Custom code for "not connected to hub"
} as const;

// Status code to message mapping
const STATUS_MESSAGES: Record<number, string> = {
  [STATUS_CODES.OK]: 'OK',
  [STATUS_CODES.FAILED]: 'Request failed',
  [STATUS_CODES.UNRECOGNIZABLE_WIFI_ROUTER]: 'Unrecognizable WiFi Router',
  [STATUS_CODES.UN_PURCHASED_CONTENT]: 'Content not purchased',
  [STATUS_CODES.WIFI_ROUTER_DISABLED]: 'WiFi Router disabled',
  [STATUS_CODES.ROUTER_RUN_OUT]: 'Router data exhausted',
  [STATUS_CODES.CONTENT_MISSING]: 'Content not found on server',
  [STATUS_CODES.UNAUTHENTICATED]: 'Authentication required',
  [STATUS_CODES.NOT_FOUND]: 'Movie not found',
  [STATUS_CODES.HUB_NOT_CONNECTED]: 'Media Hub not connected',
};

export interface DownloadRightsResult {
  success: boolean;
  allowed: boolean;
  statusCode: number;
  message: string;
  randomKey: string | null;
  responseData: any;
  debugInfo: {
    movieId: string | number;
    requestUrl: string;
    isHubConnected: boolean;
    headers: {
      authentication: string;
      userAgent: string;
      fmaAuthentication: string;
    };
    responseStatus: number | null;
    randomKeyReceived: string | null;
    playbackAllowed: boolean;
  };
}

/**
 * Get or create a persistent device ID.
 * This ID is stored locally and reused across sessions.
 * Format: SOFLIX_<device_id>
 */
async function getDeviceId(): Promise<string> {
  try {
    // Try to get existing device ID
    const storedId = await storageHelper.getItem(DEVICE_ID_KEY);
    if (storedId) {
      console.log('[DownloadRights] Using stored device ID');
      return storedId;
    }

    // Generate new device ID
    let deviceId: string;
    
    if (Platform.OS === 'android') {
      // Use Android ID if available
      deviceId = Application.getAndroidId() || `EXPO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } else if (Platform.OS === 'ios') {
      // Use iOS vendor identifier or generate one
      const iosId = await Application.getIosIdForVendorAsync();
      deviceId = iosId || `EXPO_IOS_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } else {
      // Web or other platforms
      deviceId = `EXPO_WEB_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Prefix with SOFLIX to match Android app format
    deviceId = `SOFLIX_${deviceId.replace(/-/g, '').toUpperCase()}`;

    // Store for future use
    await storageHelper.setItem(DEVICE_ID_KEY, deviceId);
    console.log('[DownloadRights] Generated new device ID:', deviceId);

    return deviceId;
  } catch (error) {
    console.error('[DownloadRights] Error getting device ID:', error);
    // Fallback device ID
    return `SOFLIX_FALLBACK_${Date.now()}`;
  }
}

/**
 * Build Fma-Authentication header value.
 * Format: Bearer {JSON}
 */
async function buildFmaAuthentication(): Promise<string> {
  const deviceId = await getDeviceId();
  
  const fmaPayload = {
    device_id: deviceId,
    player_type: '2000',
    enc_accounting: '',
  };

  return `Bearer ${JSON.stringify(fmaPayload)}`;
}

/**
 * Mask token for logging (show first 10 chars + ...)
 */
function maskToken(token: string): string {
  if (!token) return 'null';
  if (token.length <= 10) return '***';
  return token.substring(0, 10) + '...';
}

/**
 * Extract randomkey from Set-Cookie header
 */
function extractRandomKey(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  
  // Parse Set-Cookie header for randomkey
  // Format: randomkey=xxxx; path=/; ...
  const match = setCookieHeader.match(/randomkey=([^;]+)/);
  if (match && match[1]) {
    return match[1];
  }
  
  return null;
}

/**
 * Get status message for code
 */
function getStatusMessage(code: number): string {
  return STATUS_MESSAGES[code] || `Unknown error (code: ${code})`;
}

/**
 * Check download rights for a movie.
 * 
 * IMPORTANT: This API is ONLY available when connected to a Media Hub router.
 * If not connected to hub, this will return HUB_NOT_CONNECTED status.
 * 
 * @param movieId - The movie ID to check rights for
 * @param isHubConnected - Whether the device is connected to a Media Hub
 * @returns DownloadRightsResult with success/failure and randomkey
 */
export async function checkDownloadRights(
  movieId: string | number,
  isHubConnected: boolean
): Promise<DownloadRightsResult> {
  console.log('========================================');
  console.log('[DownloadRights] STEP 2: Checking download rights');
  console.log('[DownloadRights] Movie ID:', movieId);
  console.log('[DownloadRights] Hub Connected:', isHubConnected);

  // Prepare debug info base
  const debugInfoBase = {
    movieId,
    requestUrl: '',
    isHubConnected,
    headers: {
      authentication: '',
      userAgent: RIGHTS_USER_AGENT,
      fmaAuthentication: '',
    },
    responseStatus: null as number | null,
    randomKeyReceived: null as string | null,
    playbackAllowed: false,
  };

  // ====================================================
  // CHECK: If not connected to hub, return immediately
  // ====================================================
  if (!isHubConnected) {
    console.log('[DownloadRights] NOT connected to Media Hub');
    console.log('[DownloadRights] Cannot call get_download_right API');
    console.log('[DownloadRights] Returning HUB_NOT_CONNECTED');
    console.log('========================================');

    return {
      success: false,
      allowed: false,
      statusCode: STATUS_CODES.HUB_NOT_CONNECTED,
      message: 'Media Hub not connected. Please connect to a Media Hub router to play content.',
      randomKey: null,
      responseData: null,
      debugInfo: {
        ...debugInfoBase,
        playbackAllowed: false,
      },
    };
  }

  // ====================================================
  // CONNECTED TO HUB: Call get_download_right API
  // ====================================================
  
  // Build request URL - to demo.aistream.tv (but only when connected to Hub)
  const requestUrl = `${RIGHTS_API_URL}?id=${movieId}&streaming=0`;
  console.log('[DownloadRights] Request URL:', requestUrl);

  // Get authentication token
  const token = await storageHelper.getItem(STORAGE_KEYS.TOKEN);
  const authHeader = token ? `Bearer ${token}` : '';
  console.log('[DownloadRights] Authentication:', maskToken(authHeader));

  // Build Fma-Authentication header
  const fmaAuth = await buildFmaAuthentication();
  console.log('[DownloadRights] Fma-Authentication:', fmaAuth);
  console.log('[DownloadRights] User-Agent:', RIGHTS_USER_AGENT);

  // Update debug info
  const debugInfo = {
    ...debugInfoBase,
    requestUrl,
    headers: {
      authentication: maskToken(authHeader),
      userAgent: RIGHTS_USER_AGENT,
      fmaAuthentication: fmaAuth,
    },
  };

  try {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    console.log('[DownloadRights] Making request to Hub with 10s timeout...');

    // Make API call to Hub
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'Authentication': authHeader,
        'User-Agent': RIGHTS_USER_AGENT,
        'Fma-Authentication': fmaAuth,
      },
      signal: controller.signal,
    });

    // Clear timeout on success
    clearTimeout(timeoutId);

    debugInfo.responseStatus = response.status;
    console.log('[DownloadRights] Response status:', response.status);

    // Extract Set-Cookie header for randomkey
    const setCookie = response.headers.get('set-cookie');
    console.log('[DownloadRights] Set-Cookie header:', setCookie);
    
    const randomKey = extractRandomKey(setCookie);
    debugInfo.randomKeyReceived = randomKey;
    console.log('[DownloadRights] RandomKey extracted:', randomKey);

    // Parse response body
    const responseData = await response.json();
    console.log('[DownloadRights] Response body:', JSON.stringify(responseData, null, 2));

    // Check status.code
    const statusCode = responseData?.status?.code ?? -1;
    const statusMessage = responseData?.status?.message || getStatusMessage(statusCode);
    
    console.log('[DownloadRights] Status code:', statusCode);
    console.log('[DownloadRights] Status message:', statusMessage);

    // Determine if playback is allowed
    const allowed = statusCode === STATUS_CODES.OK;
    debugInfo.playbackAllowed = allowed;

    // If allowed and we have a randomkey, store it
    if (allowed && randomKey) {
      await RandomKeyManager.setKey(movieId, randomKey);
      console.log('[DownloadRights] RandomKey stored in manager');
    }

    console.log('[DownloadRights] Playback allowed:', allowed);
    console.log('========================================');

    return {
      success: true,
      allowed,
      statusCode,
      message: statusMessage,
      randomKey,
      responseData,
      debugInfo,
    };

  } catch (error: any) {
    console.error('[DownloadRights] API Error:', error);
    
    debugInfo.responseStatus = error.status || 0;
    debugInfo.playbackAllowed = false;

    // Determine error message based on error type
    let message: string;
    
    if (error.name === 'AbortError') {
      message = 'Request timed out. Please check your connection to the Media Hub.';
      console.log('[DownloadRights] Request timed out after 10 seconds');
    } else if (error.message?.includes('Network') || error.message?.includes('network')) {
      message = 'Cannot reach Media Hub. Please check your WiFi connection.';
    } else if (error.message?.includes('JSON')) {
      message = 'Invalid response from Media Hub.';
    } else {
      message = error.message || 'Failed to verify playback rights';
    }

    console.log('[DownloadRights] Playback allowed:', false);
    console.log('[DownloadRights] Error:', message);
    console.log('========================================');

    return {
      success: false,
      allowed: false,
      statusCode: -1,
      message,
      randomKey: null,
      responseData: null,
      debugInfo,
    };
  }
}

export { getDeviceId, RIGHTS_USER_AGENT, buildFmaAuthentication, RIGHTS_API_URL };
