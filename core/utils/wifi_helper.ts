/**
 * wifi_helper.ts
 *
 * Reads the currently connected WiFi BSSID and SSID.
 * Mirrors Android's WifiManager.getConnectionInfo() pattern used for hub detection.
 *
 * Platform notes:
 *  - Android: Requires ACCESS_WIFI_STATE + ACCESS_FINE_LOCATION permissions.
 *  - iOS:     Requires the "Access WiFi Information" entitlement
 *             (com.apple.developer.networking.wifi-info) + location permission.
 *             Returns null inside Expo Go sandbox — works in dev/production builds.
 *  - Web:     WiFi details not available; returns null gracefully.
 */
import NetInfo from '@react-native-community/netinfo';

export interface WifiInfo {
  /** SSID of the connected network, Android quotes stripped. */
  ssid: string | null;
  /** BSSID (AP MAC address) in uppercase, e.g. "F8:5E:3C:3F:D7:72". */
  bssid: string | null;
  /** Whether a WiFi connection is active. */
  isWifi: boolean;
}

/**
 * Fetch current WiFi SSID and BSSID.
 *
 * Android returns SSID wrapped in double-quotes ("\"ssid\"") — we strip them
 * to match the Java pattern: wifiInfo.getSSID().replace("\"", "")
 *
 * BSSID is normalised to uppercase so comparison against router.mac is
 * case-insensitive (router MACs from API are uppercase).
 */
export async function getWifiInfo(): Promise<WifiInfo> {
  try {
    const state = await NetInfo.fetch('wifi');

    if (state.type !== 'wifi' || !state.isConnected) {
      return { ssid: null, bssid: null, isWifi: false };
    }

    const details = state.details as {
      ssid?: string | null;
      bssid?: string | null;
    } | null;

    if (!details) {
      return { ssid: null, bssid: null, isWifi: true };
    }

    // Android wraps SSID in double-quotes — strip leading/trailing quotes.
    let ssid = details.ssid ?? null;
    if (ssid) {
      ssid = ssid.replace(/^"|"$/g, '');
    }

    // Normalise BSSID to uppercase for consistent comparison.
    const bssid = details.bssid ? details.bssid.toUpperCase() : null;

    return { ssid, bssid, isWifi: true };
  } catch (err) {
    console.warn('[wifi_helper] Could not read WiFi info:', err);
    return { ssid: null, bssid: null, isWifi: false };
  }
}
