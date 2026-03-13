/**
 * player.tsx
 * 
 * Video Player Screen - Uses react-native-video for proper header support.
 * 
 * NOTE: This requires a DEVELOPMENT BUILD, not Expo Go.
 * Run: npx expo run:android or npx expo run:ios
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video, { OnLoadData, OnErrorData, OnBufferData } from 'react-native-video';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PlaybackHeaders {
  Authentication: string;
  'User-Agent': string;
  'Fma-Authentication': string;
  Cookie: string;
}

export default function PlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const videoRef = useRef<any>(null);

  // Parse params
  const playbackUrl = params.playbackUrl as string;
  const movieName = params.movieName as string || 'Video';
  const headersParam = params.headers as string;
  const debugInfoParam = params.debugInfo as string;
  
  // Parse headers and debug info
  const headers: PlaybackHeaders | null = headersParam ? JSON.parse(headersParam) : null;
  const debugInfo = debugInfoParam ? JSON.parse(debugInfoParam) : null;

  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  // ====================================================
  // DEBUG LOGGING
  // ====================================================
  useEffect(() => {
    console.log('====================================================');
    console.log('[Player] PLAYER FLOW STARTED');
    console.log('====================================================');
    console.log('[Player] Movie Name:', movieName);
    console.log('[Player] Movie ID:', debugInfo?.movieId);
    console.log('[Player] RandomKey (from Cookie):', headers?.Cookie || 'NOT SET');
    console.log('[Player] Final m3u8 URL:', playbackUrl);
    console.log('----------------------------------------------------');
    console.log('[Player] HEADERS TO INJECT:');
    if (headers) {
      console.log('  - Authentication:', headers.Authentication);
      console.log('  - User-Agent:', headers['User-Agent']);
      console.log('  - Fma-Authentication:', headers['Fma-Authentication']);
      console.log('  - Cookie:', headers.Cookie);
    } else {
      console.log('  WARNING: No headers provided!');
    }
    console.log('====================================================');
  }, [playbackUrl, movieName, headers, debugInfo]);

  // Auto-hide controls after 3 seconds
  useEffect(() => {
    if (showControls && !isPaused) {
      const timer = setTimeout(() => {
        setShowControls(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showControls, isPaused]);

  /**
   * Handle video load
   */
  const onLoad = (data: OnLoadData) => {
    console.log('[Player] onLoad - Video loaded successfully');
    console.log('[Player] Duration:', data.duration);
    console.log('[Player] m3u8 and ts requests SUCCESS');
    setIsLoading(false);
    setError(null);
  };

  /**
   * Handle buffering state
   */
  const onBuffer = (data: OnBufferData) => {
    console.log('[Player] Buffering:', data.isBuffering);
    setIsBuffering(data.isBuffering);
  };

  /**
   * Handle video error
   */
  const onError = (data: OnErrorData) => {
    console.error('[Player] Video error:', data.error);
    const errorMessage = data.error?.errorString || data.error?.code?.toString() || 'Unknown playback error';
    console.log('[Player] Playback FAILED - Error:', errorMessage);
    setError(`${errorMessage}`);
    setIsLoading(false);
  };

  /**
   * Handle ready for display
   */
  const onReadyForDisplay = () => {
    console.log('[Player] Ready for display');
    setIsLoading(false);
  };

  /**
   * Toggle controls visibility
   */
  const toggleControls = () => {
    setShowControls(!showControls);
  };

  /**
   * Toggle play/pause
   */
  const togglePlayPause = () => {
    setIsPaused(!isPaused);
    setShowControls(true);
  };

  /**
   * Go back to previous screen
   */
  const handleBack = () => {
    console.log('[Player] Exiting player');
    router.back();
  };

  // Error state
  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#EF4444" />
          <Text style={styles.errorTitle}>Playback Error</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <Text style={styles.errorUrl} numberOfLines={3}>URL: {playbackUrl}</Text>
          {headers?.Cookie && (
            <Text style={styles.errorCookie}>Cookie: {headers.Cookie}</Text>
          )}
          <TouchableOpacity style={styles.retryBtn} onPress={handleBack}>
            <Ionicons name="arrow-back" size={20} color="#FFF" />
            <Text style={styles.retryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // No URL provided
  if (!playbackUrl) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={64} color="#F59E0B" />
          <Text style={styles.errorTitle}>No Video URL</Text>
          <Text style={styles.errorMessage}>Playback URL was not provided.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleBack}>
            <Ionicons name="arrow-back" size={20} color="#FFF" />
            <Text style={styles.retryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Build source with headers for react-native-video
  const videoSource = {
    uri: playbackUrl,
    headers: headers ? {
      'Authentication': headers.Authentication,
      'User-Agent': headers['User-Agent'],
      'Fma-Authentication': headers['Fma-Authentication'],
      'Cookie': headers.Cookie,
    } : undefined,
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      {/* Video Player using react-native-video */}
      <TouchableOpacity 
        style={styles.videoContainer} 
        activeOpacity={1}
        onPress={toggleControls}
      >
        <Video
          ref={videoRef}
          source={videoSource}
          style={styles.video}
          resizeMode="contain"
          paused={isPaused}
          repeat={false}
          onLoad={onLoad}
          onBuffer={onBuffer}
          onError={onError}
          onReadyForDisplay={onReadyForDisplay}
          playInBackground={false}
          playWhenInactive={false}
          ignoreSilentSwitch="ignore"
          progressUpdateInterval={1000}
        />

        {/* Loading Overlay */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#FF4D6D" />
            <Text style={styles.loadingText}>Loading video...</Text>
            <Text style={styles.loadingSubtext}>Fetching m3u8 manifest with headers</Text>
          </View>
        )}

        {/* Buffering Overlay */}
        {isBuffering && !isLoading && (
          <View style={styles.bufferingOverlay}>
            <ActivityIndicator size="small" color="#FF4D6D" />
            <Text style={styles.bufferingText}>Buffering...</Text>
          </View>
        )}

        {/* Controls Overlay */}
        {showControls && (
          <View style={styles.controlsOverlay}>
            {/* Top Bar */}
            <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
              <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
                <Ionicons name="arrow-back" size={28} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.movieTitle} numberOfLines={1}>
                {movieName}
              </Text>
              <View style={{ width: 44 }} />
            </View>

            {/* Center Play/Pause */}
            <View style={styles.centerControls}>
              <TouchableOpacity 
                style={styles.playPauseBtn}
                onPress={togglePlayPause}
              >
                <Ionicons 
                  name={isPaused ? "play" : "pause"} 
                  size={50} 
                  color="#FFF" 
                />
              </TouchableOpacity>
            </View>

            {/* Bottom Bar - Debug Info */}
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
              <View style={styles.debugRow}>
                <Text style={styles.debugLabel}>URL:</Text>
                <Text style={styles.debugUrl} numberOfLines={1}>
                  {playbackUrl}
                </Text>
              </View>
              {headers?.Cookie && (
                <View style={styles.debugRow}>
                  <Text style={styles.debugLabel}>Cookie:</Text>
                  <Text style={[styles.debugUrl, { color: '#F59E0B' }]} numberOfLines={1}>
                    {headers.Cookie}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 12,
  },
  loadingSubtext: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 4,
  },
  bufferingOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -50 }, { translateY: -30 }],
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  bufferingText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  movieTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 10,
  },
  centerControls: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 77, 109, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  debugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  debugLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    marginRight: 8,
    width: 50,
  },
  debugUrl: {
    flex: 1,
    color: '#6EE7B7',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
  },
  errorMessage: {
    color: '#9CA3AF',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
  },
  errorUrl: {
    color: '#6B7280',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
  },
  errorCookie: {
    color: '#F59E0B',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FF4D6D',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
