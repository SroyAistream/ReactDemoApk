/**
 * hotspot.tsx — AiStream Hub Detection Screen
 *
 * Implements Android-equivalent hub detection with offline-first data loading:
 *   1. Load cached routers from SQLite immediately
 *   2. Background sync fresh data from /fag/routers
 *   3. Read connected WiFi BSSID + SSID
 *   4. Match: wifi.BSSID == router.mac | router.mac_5g
 *             OR wifi.SSID == router.ssid | router.ssid5g
 *   5. If matched → set connected hub + persist to AsyncStorage
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { getWifiInfo, WifiInfo } from '../core/utils/wifi_helper';
import { useRoutersStore } from '../features/routers/presentation/providers/routers_provider';
import { Router } from '../features/routers/domain/entities/router';
import { useHubDetection } from '../core/hooks/useHubDetection';

// ─── Storage keys ────────────────────────────────────────────────────────────
const LOCATION_CACHE_KEY = 'cached_user_location';
/** Persisted for media download: the matched hub's full config. */
export const CONNECTED_HUB_KEY = 'connected_hub';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserLocation {
  latitude: number;
  longitude: number;
  timestamp: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toRadians = (deg: number) => deg * (Math.PI / 180);

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Android-equivalent hub detection.
 *
 * Java source pattern:
 *   if (router.getMac().equals(bssid) || router.getMac5g().equals(bssid) ||
 *       router.getSsid().equals(ssid) || router.getSsid5g().equals(ssid))
 *
 * BSSID comparison is case-insensitive (normalised to uppercase by wifi_helper).
 */
function detectConnectedHub(routers: Router[], wifi: WifiInfo): Router | null {
  if (!wifi.bssid && !wifi.ssid) return null;

  for (const router of routers) {
    // BSSID match — 2.4 GHz or 5 GHz MAC
    if (wifi.bssid) {
      if (router.mac && router.mac.toUpperCase() === wifi.bssid) return router;
      if (router.mac_5g && router.mac_5g.toUpperCase() === wifi.bssid) return router;
    }
    // SSID match — 2.4 GHz or 5 GHz network name
    if (wifi.ssid) {
      if (router.ssid && router.ssid === wifi.ssid) return router;
      if (router.ssid5g && router.ssid5g === wifi.ssid) return router;
    }
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function HotspotScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

    // 2. Initialize the Hub Detection hook
  const { isHubConnected } = useHubDetection();
  // Use the offline-first routers store
  const { routers: storeRouters, isLoading, isRefreshing, fetchRouters } = useRoutersStore();

  const [displayRouters, setDisplayRouters] = useState<Router[]>([]);
  const [connectedHub, setConnectedHub] = useState<Router | null>(null);
  const [wifiInfo, setWifiInfo] = useState<WifiInfo | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Initializing...');


// 3. Make the initial load reactive
  useEffect(() => {
    loadAll();
  }, [isHubConnected]); // Re-run if network switches

  // Process routers when they change from the store
  useEffect(() => {
    if (storeRouters.length > 0) {
      processAndDetectHub(storeRouters);
    }
  }, [storeRouters]);

  // ── Main loader ────────────────────────────────────────────────────────────

  const loadAll = async () => {
    setError(null);

    try {
      // 1. Fetch routers via offline-first store
      setStatusText('Fetching hubs...');
      fetchRouters(isHubConnected);

      // 2. Read WiFi info (BSSID + SSID)
      setStatusText('Checking WiFi...');
      const wifi = await getWifiInfo();
      setWifiInfo(wifi);
      console.log('[HotspotScreen] WiFi info:', wifi);

      // 3. Get location
      setStatusText('Getting location...');
      await getUserLocation();

      setStatusText('');

    } catch (err: any) {
      console.error('[HotspotScreen] Error:', err);
      setError(err?.message ?? 'Failed to load hubs');
      setStatusText('');
    }
  };

  /**
   * Process routers with location and detect connected hub
   */
  const processAndDetectHub = async (routerList: Router[]) => {
    try {
      // Get WiFi info if not already loaded
      let wifi = wifiInfo;
      if (!wifi) {
        wifi = await getWifiInfo();
        setWifiInfo(wifi);
      }

      // Match against router list (Android logic)
      const matched = detectConnectedHub(routerList, wifi);
      setConnectedHub(matched);
      console.log('[HotspotScreen] Matched hub:', matched?.name ?? 'none');

      // Persist matched router for media download
      if (matched) {
        await AsyncStorage.setItem(CONNECTED_HUB_KEY, JSON.stringify(matched));
        console.log('[HotspotScreen] Connected hub saved:', matched.name);
      } else {
        await AsyncStorage.removeItem(CONNECTED_HUB_KEY);
      }

      // Process with location and compute distances
      const location = userLocation ?? await getUserLocation();
      const processed = processRouters(routerList, location);
      setDisplayRouters(processed);

    } catch (err: any) {
      console.error('[HotspotScreen] processAndDetectHub error:', err);
    }
  };

  const onRefresh = useCallback(() => {
    AsyncStorage.removeItem(LOCATION_CACHE_KEY).then(() => {
      fetchRouters(isHubConnected, true); // forceRefresh
      loadAll();
    });
  }, [fetchRouters]);

  // ── Location ───────────────────────────────────────────────────────────────

  const getUserLocation = async (): Promise<UserLocation | null> => {
    try {
      const cached = await AsyncStorage.getItem(LOCATION_CACHE_KEY);
      if (cached) {
        const loc = JSON.parse(cached) as UserLocation;
        if (Date.now() - loc.timestamp < 5 * 60 * 1000) {
          setUserLocation(loc);
          return loc;
        }
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const loc: UserLocation = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        timestamp: Date.now(),
      };
      setUserLocation(loc);
      await AsyncStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(loc));
      return loc;
    } catch {
      return null;
    }
  };

  // ── Distance processing ────────────────────────────────────────────────────

  const processRouters = (list: Router[], location: UserLocation | null): Router[] => {
    const result = list.map((r) => {
      const lat = typeof r.latitude === 'string' ? parseFloat(r.latitude) : r.latitude;
      const lng = typeof r.longitude === 'string' ? parseFloat(r.longitude) : r.longitude;

      let calculatedDistance: number | undefined;
      if (location && lat && lng && !isNaN(lat) && !isNaN(lng)) {
        calculatedDistance = haversineKm(location.latitude, location.longitude, lat, lng);
      } else if (r.distance) {
        calculatedDistance =
          typeof r.distance === 'string' ? parseFloat(r.distance) : r.distance;
      }
      return { ...r, latitude: lat, longitude: lng, calculatedDistance };
    });

    return result.sort((a, b) => {
      if (a.calculatedDistance === undefined) return 1;
      if (b.calculatedDistance === undefined) return -1;
      return a.calculatedDistance - b.calculatedDistance;
    });
  };

  // ── Map ────────────────────────────────────────────────────────────────────

  const openMap = (r: Router) => {
    if (!r.latitude || !r.longitude) {
      Alert.alert('Error', 'No coordinates for this hub');
      return;
    }
    const label = encodeURIComponent(r.name);
    const lat = r.latitude;
    const lng = r.longitude;
    let url =
      Platform.OS === 'ios'
        ? `maps:0,0?q=${label}@${lat},${lng}`
        : Platform.OS === 'android'
          ? `geo:${lat},${lng}?q=${lat},${lng}(${label})`
          : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

    Linking.canOpenURL(url).then((ok) => {
      Linking.openURL(ok ? url : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
    });
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const isConnectedRouter = (r: Router) => connectedHub?.id === r.id;

  const renderConnectedBanner = () => {
    if (!connectedHub) return null;
    return (
      <View style={styles.connectedBanner} data-testid="connected-hub-banner">
        <View style={styles.connectedBannerLeft}>
          <View style={styles.connectedPulse} />
          <Ionicons name="wifi" size={22} color="#10B981" />
        </View>
        <View style={styles.connectedInfo}>
          <Text style={styles.connectedLabel}>Connected Hub</Text>
          <Text style={styles.connectedName} numberOfLines={1}>{connectedHub.name}</Text>
          {wifiInfo?.ssid && (
            <Text style={styles.connectedSSID} numberOfLines={1}>
              SSID: {wifiInfo.ssid}
            </Text>
          )}
          {connectedHub.config?.download_servers && connectedHub.config.download_servers.length > 0 && (
            <Text style={styles.connectedServers} numberOfLines={1}>
              {connectedHub.config.download_servers.length} download server
              {connectedHub.config.download_servers.length !== 1 ? 's' : ''} available
            </Text>
          )}
        </View>
        <View style={styles.connectedBadge}>
          <Ionicons name="checkmark-circle" size={28} color="#10B981" />
        </View>
      </View>
    );
  };

  const renderNoHubBanner = () => {
    if (connectedHub) return null;
    if (!wifiInfo) return null;

    return (
      <View style={styles.noHubBanner} data-testid="no-hub-banner">
        <Ionicons name="wifi-outline" size={20} color="#9CA3AF" />
        <Text style={styles.noHubText}>
          {wifiInfo.isWifi
            ? `Not connected to an AiStream hub (${wifiInfo.ssid ?? 'unknown SSID'})`
            : 'Not connected to WiFi — connect to an AiStream hub to unlock local content'}
        </Text>
      </View>
    );
  };

  const renderRouterCard = (r: Router) => {
    const isConnected = isConnectedRouter(r);
    return (
      <View
        key={r.id}
        style={[styles.routerCard, isConnected && styles.routerCardConnected]}
        data-testid={`router-card-${r.id}`}
      >
        {/* Connected glow border handled via style above */}

        {/* Icon */}
        <View style={[styles.routerIcon, isConnected && styles.routerIconConnected]}>
          <Ionicons name="wifi" size={22} color={isConnected ? '#10B981' : '#FF4D6D'} />
        </View>

        {/* Info */}
        <View style={styles.routerInfo}>
          <View style={styles.routerNameRow}>
            <Text style={[styles.routerName, isConnected && styles.routerNameConnected]} numberOfLines={1}>
              {r.name}
            </Text>
            {isConnected && (
              <View style={styles.connectedChip}>
                <Text style={styles.connectedChipText}>CONNECTED</Text>
              </View>
            )}
          </View>

          {/* SSID row */}
          {(r.ssid || r.ssid5g) && (
            <Text style={styles.routerSSID} numberOfLines={1}>
              {[r.ssid, r.ssid5g].filter(Boolean).join(' / ')}
            </Text>
          )}

          <Text style={styles.routerLocation} numberOfLines={1}>
            {[r.city, r.region].filter(Boolean).join(', ')}
          </Text>
          <Text style={styles.routerCountry}>{r.country ?? 'Unknown'}</Text>

          {r.calculatedDistance !== undefined &&
            typeof r.calculatedDistance === 'number' &&
            !isNaN(r.calculatedDistance) && (
              <Text style={[styles.routerDistance, isConnected && styles.routerDistanceConnected]}>
                {r.calculatedDistance.toFixed(1)} km away
              </Text>
          )}
        </View>

        {/* Map button */}
        <TouchableOpacity
          style={[styles.mapButton, isConnected && styles.mapButtonConnected]}
          onPress={() => openMap(r)}
          activeOpacity={0.7}
          data-testid={`map-button-${r.id}`}
        >
          <Ionicons name="map" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    );
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <LinearGradient colors={['#12001F', '#000000']} style={styles.container}>
        <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color="#FF4D6D" />
          <Text style={styles.loadingText}>{statusText}</Text>
        </View>
      </LinearGradient>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={['#12001F', '#000000']} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#FF4D6D"
            colors={['#FF4D6D']}
          />
        }
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AiStream Hubs</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Connected hub banner (or no-hub notice) */}
        {renderConnectedBanner()}
        {renderNoHubBanner()}

        {/* Location status */}
        {userLocation && (
          <View style={styles.locationBanner}>
            <Ionicons name="location" size={16} color="#10B981" />
            <Text style={styles.locationText}>
              {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
            </Text>
          </View>
        )}

        {/* Error banner */}
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color="#FF4D6D" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Router list */}
        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>
            {displayRouters.length} Hub{displayRouters.length !== 1 ? 's' : ''} Found
          </Text>

          {displayRouters.length > 0 ? (
            displayRouters.map(renderRouterCard)
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="wifi-outline" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>No hubs available</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: '#9CA3AF',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },

  // Connected hub banner
  connectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    gap: 12,
  },
  connectedBannerLeft: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: 32,
  },
  connectedPulse: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  connectedInfo: { flex: 1 },
  connectedLabel: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  connectedName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  connectedSSID: {
    fontSize: 12,
    color: '#6EE7B7',
    marginBottom: 2,
  },
  connectedServers: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  connectedBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // No-hub banner
  noHubBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    gap: 10,
  },
  noHubText: {
    flex: 1,
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
  },

  // Location
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 6,
  },
  locationText: {
    fontSize: 12,
    color: '#6B7280',
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,77,109,0.15)',
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#FF4D6D',
  },

  // List
  listSection: { paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Router card
  routerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  routerCardConnected: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  routerIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,77,109,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  routerIconConnected: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  routerInfo: { flex: 1 },
  routerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
    flexWrap: 'wrap',
  },
  routerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  routerNameConnected: {
    color: '#6EE7B7',
  },
  connectedChip: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  connectedChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  routerSSID: {
    fontSize: 12,
    color: '#6EE7B7',
    marginBottom: 2,
  },
  routerLocation: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 1,
  },
  routerCountry: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 3,
  },
  routerDistance: {
    fontSize: 12,
    color: '#FF4D6D',
    fontWeight: '600',
  },
  routerDistanceConnected: {
    color: '#10B981',
  },
  mapButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF4D6D',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  mapButtonConnected: {
    backgroundColor: '#10B981',
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 14,
  },
});
