/**
 * hub_provider.ts
 *
 * Global Zustand store for AiStream Media Hub connection state.
 *
 * Detection logic (mirrors Android WifiManager pattern):
 *   wifi.BSSID == router.mac | router.mac_5g
 *   OR wifi.SSID == router.ssid | router.ssid5g
 *
 * Used by:
 *  - hotspot.tsx  → calls detectHub() and reflects result in UI
 *  - movie-detail.tsx → reads isHubConnected before allowing playback
 *  - MediaHubDialog → polls detectHub() while dialog is open
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getWifiInfo, WifiInfo } from '../../../../core/utils/wifi_helper';
import { apiClient } from '../../../../core/network/api_client';
import { STORAGE_KEYS } from '../../../../core/constants/api_constants';

export const CONNECTED_HUB_KEY = 'connected_hub';

export interface RouterConfig {
  download_servers?: string[];
  is_reverse_proxy?: number;
  max_download_speed?: number;
  work_mode?: number;
}

export interface ConnectedRouter {
  id: number;
  name: string;
  mac?: string;
  mac_5g?: string;
  ssid?: string;
  ssid5g?: string;
  city?: string;
  country?: string;
  hotspot_id?: string;
  config?: RouterConfig;
}

interface HubState {
  connectedHub: ConnectedRouter | null;
  isHubConnected: boolean;
  wifiInfo: WifiInfo | null;
  isDetecting: boolean;

  /** Run hub detection: fetch routers + match WiFi. Updates store and AsyncStorage. */
  detectHub: () => Promise<void>;
  /** Load cached connected hub from AsyncStorage on app start. */
  initFromCache: () => Promise<void>;
  /** Manually clear hub state. */
  clearHub: () => void;
}

// ─── Matching logic (exact Android equivalent) ───────────────────────────────

function matchRouter(router: ConnectedRouter, wifi: WifiInfo): boolean {
  if (wifi.bssid) {
    if (router.mac && router.mac.toUpperCase() === wifi.bssid) return true;
    if (router.mac_5g && router.mac_5g.toUpperCase() === wifi.bssid) return true;
  }
  if (wifi.ssid) {
    if (router.ssid && router.ssid === wifi.ssid) return true;
    if (router.ssid5g && router.ssid5g === wifi.ssid) return true;
  }
  return false;
}

function findMatch(list: ConnectedRouter[], wifi: WifiInfo): ConnectedRouter | null {
  if (!wifi.bssid && !wifi.ssid) return null;
  return list.find((r) => matchRouter(r, wifi)) ?? null;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useHubStore = create<HubState>((set, get) => ({
  connectedHub: null,
  isHubConnected: false,
  wifiInfo: null,
  isDetecting: false,

  detectHub: async () => {
    if (get().isDetecting) return;
    set({ isDetecting: true });

    try {
      // 1. Read current WiFi
      const wifi = await getWifiInfo();
      set({ wifiInfo: wifi });

      // 2. Fetch router list
      const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
      const response = await apiClient.get<any>('/fag/routers', {
        headers: token ? { Authentication: `Bearer ${token}` } : {},
      });
      const list: ConnectedRouter[] = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];

      // 3. Match (Android logic)
      const matched = findMatch(list, wifi);

      // 4. Persist and update store
      if (matched) {
        await AsyncStorage.setItem(CONNECTED_HUB_KEY, JSON.stringify(matched));
      } else {
        await AsyncStorage.removeItem(CONNECTED_HUB_KEY);
      }

      set({
        connectedHub: matched,
        isHubConnected: matched !== null,
        isDetecting: false,
      });
    } catch (err) {
      console.warn('[HubStore] detectHub error:', err);
      set({ isDetecting: false });
    }
  },

  initFromCache: async () => {
    try {
      const cached = await AsyncStorage.getItem(CONNECTED_HUB_KEY);
      if (cached) {
        const router = JSON.parse(cached) as ConnectedRouter;
        // Re-verify against current WiFi before trusting cache
        const wifi = await getWifiInfo();
        const stillMatches = matchRouter(router, wifi);
        set({
          connectedHub: stillMatches ? router : null,
          isHubConnected: stillMatches,
          wifiInfo: wifi,
        });
      }
    } catch {
      // Cache miss or parse error — leave state as-is
    }
  },

  clearHub: () =>
    set({ connectedHub: null, isHubConnected: false, wifiInfo: null }),
}));
