import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHubDetection } from '../core/hooks/useHubDetection';
import { getPlaybackUrl, PlaybackResult } from '../core/services/PlaybackService';
import { 
  checkDownloadRights, 
  DownloadRightsResult, 
  STATUS_CODES 
} from '../core/services/DownloadRightsService';
import { getBaseUrl } from '../core/config/app_config';

import { COMPANY_NAME } from './constants/app_constants';
import { useDownloadsStore } from '../features/downloads/presentation/providers/downloads_provider';
import { getLocalPlaybackPath } from '../core/services/DownloadService';
import { databaseHelper } from '@/core/database/database_helper.native';
import { ToastAndroid, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';




const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PREVIEW_HEIGHT = SCREEN_HEIGHT * 0.65;

/**
 * Base URL for images - matches Android Config.picURLPath
 */
const IMAGE_BASE_URL = 'https://demo.aistream.tv:8833/';
const PLACEHOLDER_BLURHASH = 'L02}lN0000%g0000WB9Z9Zt79F-p';

export default function MovieDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  
  // Simple gateway-based hub detection
  const { deviceIp, gatewayIp, isHubConnected, isLoading, detectHub, HUB_GATEWAY_IP } = useHubDetection();

  const [showDebugDialog, setShowDebugDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [showHubNotConnectedDialog, setShowHubNotConnectedDialog] = useState(false);
  const [isCheckingRights, setIsCheckingRights] = useState(false);
  const [rightsResult, setRightsResult] = useState<DownloadRightsResult | null>(null);
  const [playbackResult, setPlaybackResult] = useState<PlaybackResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [prevStatus, setPrevStatus] = useState<string | null>(null);

  // Parse the movie object from params (must come before download store usage)
  const movie = params.movie ? JSON.parse(params.movie as string) : null;

  // Downloads store
  const {
    downloads,
    loadDownloads,
    queueDownload,
    startDownload,
    getDownloadByMovieId,
  } = useDownloadsStore();

  const movieId = movie ? (movie.movie_id ?? movie.movieId ?? movie.id) : null;
  const downloadItem = movieId != null ? getDownloadByMovieId(movieId) : undefined;
  const isDownloaded   = downloadItem?.status === 'completed';
  const isDownloading  = downloadItem?.status === 'downloading';
  const isPending      = downloadItem?.status === 'pending';
  const downloadProgress = downloadItem?.progress ?? 0;

  useEffect(() => {
    loadDownloads();
  }, []);

  useEffect(() => {
  if (!downloadItem) return;

  // Detect transition → completed
  if (prevStatus === 'downloading' && downloadItem.status === 'completed') {
    
    const message = 'Download completed';

    if (Platform.OS === 'android') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      Alert.alert('Success', message);
    }

    console.log('[Download] Completed toast shown');
  }

  setPrevStatus(downloadItem.status);

}, [downloadItem?.status]);

  /**
   * ====================================================
   * PLAY BUTTON CLICK - ANDROID EXACT FLOW
   * ====================================================
   * 
   * STEP 1: DO NOT open player immediately. Start validation flow.
   * STEP 2: Check if connected to Media Hub
   *         - If NOT connected → Show "Media Hub not connected" popup, STOP
   *         - If connected → Call get_download_right API
   * STEP 3: If status.code != 0, show error and STOP
   * STEP 4: If status.code == 0, extract randomkey and build URL
   * STEP 5: Open player with final URL and headers
   */
  const handlePlay = async () => {
    if (!movie) return;

    const movieId = movie.movie_id || movie.movieId || movie.id;

    // ====================================================
    // LOCAL DOWNLOAD CHECK – play offline without hub
    // ====================================================
    try {
      const localPath = await getLocalPlaybackPath(movieId);
      if (localPath) {
        console.log('[Play] Playing from local download:', localPath);
        router.push({
          pathname: '/player' as any,
          params: {
            playbackUrl: localPath,
            movieName: movie.name || 'Video',
            headers: JSON.stringify({}),
            debugInfo: JSON.stringify({ movieId, isLocal: true }),
          },
        });
        return;
      }
    } catch (e) {
      console.log('[Play] Local path check skipped:', e);
    }

    console.log('====================================================');
    console.log('[Play] STEP 1 — PLAY BUTTON CLICKED');
    console.log('[Play] DO NOT open player immediately - Start validation');
    console.log('[Play] Movie ID:', movieId);
    console.log('====================================================');
    
    // Re-detect hub connection first
    detectHub();
    
    // Reset state
    setRightsResult(null);
    setPlaybackResult(null);
    setErrorMessage('');

    // ====================================================
    // STEP 2: Check if connected to Media Hub
    // ====================================================
    console.log('[Play] STEP 2 — Checking Hub Connection');
    console.log('[Play] Gateway IP:', gatewayIp);
    console.log('[Play] Is Hub Connected:', isHubConnected);

    if (!isHubConnected) {
      // NOT CONNECTED TO HUB - Show popup and STOP
      console.log('[Play] NOT connected to Media Hub');
      console.log('[Play] Showing "Media Hub not connected" popup');
      console.log('[Play] STOPPING playback flow');
      console.log('====================================================');
      
      setShowHubNotConnectedDialog(true);
      return;
    }

    // ====================================================
    // CONNECTED TO HUB - Proceed with rights check
    // ====================================================
    console.log('[Play] Connected to Media Hub - Proceeding with rights check');
    
    // Show loading state
    setIsCheckingRights(true);
    // setShowDebugDialog(true);

    // Call get_download_right API
    console.log('[Play] Calling get_download_right API...');
    const rights = await checkDownloadRights(movieId, isHubConnected);
    setRightsResult(rights);
    setIsCheckingRights(false);

    // ====================================================
    // RESPONSE HANDLING: Check status.code
    // ====================================================
    console.log('[Play] Status code received:', rights.statusCode);
    
    // IF status.code != 0: show proper message, STOP playback flow
    if (rights.statusCode !== STATUS_CODES.OK) {
      console.log('[Play] Status code is NOT 0 - STOPPING playback flow');
      console.log('[Play] Error message:', rights.message);
      setErrorMessage(rights.message || 'Playback not allowed');
      setShowErrorDialog(true);
      setShowDebugDialog(false);
      return;
    }

    // IF status.code == 0: extract randomkey and proceed
    console.log('[Play] Status code is 0 (OK) - Proceeding to URL construction');
    console.log('[Play] RandomKey received:', rights.randomKey);

    
  /**
   * Navigate to player with the built URL and headers
   */
  

    // ====================================================
    // STEP 3: BUILD PLAYBACK URL (ANDROID STYLE)
    // ====================================================
    
    // Build playback URL using PlaybackService
    const result = await getPlaybackUrl(movie, isHubConnected);
    // setPlaybackResult(result);
    
    // Log all debug info
    console.log('[Play] URL Construction complete');
    console.log('[Play] fileName used:', result.debugInfo.normalizedFileName);
    console.log('[Play] FINAL m3u8 URL:', result.debugInfo.finalUrl);
    console.log('[Play] Headers to inject:', result.debugInfo.headersApplied);
    console.log('====================================================');
    navigateToPlayer();
    if (result.success) {
  router.push({
    pathname: '/player' as any,
    params: {
      playbackUrl: result.playbackUrl,
      movieName: movie?.name || 'Video',
      headers: JSON.stringify(result.headers),
      debugInfo: JSON.stringify(result.debugInfo),
      // Indicate if we need to trigger a background sync
      autoDownload: !isDownloaded ? 'true' : 'false',
      movieData: JSON.stringify(movie)
    },
  });
    

   
}
   
  };

  const startBackgroundDownload = async (result: PlaybackResult) => {

        console.log('====================================================');
    console.log('[Play] Downloading content');
    console.log('====================================================');
  if (!playbackResult?.success || !movie) return;

  try {
    console.log('[BG Download] Starting background download...');

    const { playbackUrl, headers } = playbackResult;

    // Call your download service
    await startDownload(movie, true); // true = hub connected

    console.log('[BG Download] Download triggered');

  } catch (err) {
    console.log('[BG Download] Failed:', err);
  }
};

  const navigateToPlayer = () => {
    if (!playbackResult?.success) return;
    
    setShowDebugDialog(false);
    
    console.log('====================================================');
    console.log('[Play] OPENING PLAYER');
    console.log('[Play] Final m3u8 URL:', playbackResult.playbackUrl);
    console.log('[Play] Headers attached:', JSON.stringify(playbackResult.headers, null, 2));
    console.log('====================================================');

    handleDownload();
    
    // Navigate to player with URL and headers
    router.push({
      pathname: '/player' as any,
      params: {
        playbackUrl: playbackResult.playbackUrl,
        movieName: movie?.name || 'Video',
        fileName:movie.quality_list[0].file_name,
        headers: JSON.stringify(playbackResult.headers),
        debugInfo: JSON.stringify(playbackResult.debugInfo),
      },
    });
  };

  // ====================================================
  // DOWNLOAD BUTTON HANDLER
  // ====================================================
  const handleDownload = async () => {
    if (!movie) return;

    if (isHubConnected) {
      // Hub connected → start download immediately
      console.log('[Download] Hub connected – starting download immediately');
      await databaseHelper.init();
      startDownload(movie, true);
    } else {
      // Not connected → save as pending for later
      console.log('[Download] Hub not connected – queuing download for later');
      await queueDownload(movie);
      Alert.alert(
        'Download Queued',
        'This movie will be downloaded automatically the next time you connect to an AiStream Media Hub.',
        [{ text: 'OK' }]
      );
    }
  };

  if (!movie) {
    return (
      <LinearGradient colors={['#12001F', '#000000']} style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="film-outline" size={64} color="#FF4D6D" />
          <Text style={styles.errorText}>Movie not found</Text>
          <TouchableOpacity style={styles.errorButton} onPress={() => router.back()}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  // ─────────────────────────────────────────────
  // Helper Functions
  // ─────────────────────────────────────────────
  
//   const getPreviewUrl = (): string | null => {
//     let previewPath: string | null = null;
    
//     if (movie.preview && movie.preview.trim() !== '') {
//       previewPath = movie.preview;
//     } else if (movie.theatrical_poster && movie.theatrical_poster.trim() !== '') {
//       previewPath = movie.theatrical_poster;
//     } else if (movie.poster && movie.poster.trim() !== '') {
//       previewPath = movie.poster;
//     }

//     if (!previewPath) return null;
// // ✅ FIX: Use the dynamic base URL based on Hub connection
//     const dynamicBase = getBaseUrl(isHubConnected);
//     const base = dynamicBase.endsWith('/') ? dynamicBase : dynamicBase + '/';
//     const path = previewPath.startsWith('/') ? previewPath.slice(1) : previewPath;
//     return base + path;
//   };
const getPreviewUrl = (): string | null => {
    // 1. Gather the best available string from the movie object
    const rawString = 
      movie.preview_url || 
      movie.preview || 
      movie.poster_url || 
      movie.theatrical_poster || 
      movie.poster;
      
    if (!rawString) return null;

    // 2. Ruthlessly strip ANY existing base URLs to get the pure relative path
    let purePath = rawString
      .replace('https://demo.aistream.tv:8833', '')
      .replace('http://konnekt.aistream.tv:88', '')
      .replace('http://192.168.39.20:88', ''); // Catch both just in case

    // Clean up any double or leading slashes
    if (purePath.startsWith('/')) {
      purePath = purePath.slice(1);
    }

    // 3. Rebuild the URL using the real-time network state
    const dynamicBase = getBaseUrl(isHubConnected);
    const base = dynamicBase.endsWith('/') ? dynamicBase : dynamicBase + '/';
    
    const resolvedUrl = base + purePath;

    return resolvedUrl;
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return '';
    const totalMinutes = Math.round(seconds / 60);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
    if (hrs > 0) return `${hrs}h`;
    return `${mins}m`;
  };


  const getGenreList = (): string[] => {
    if (!movie.genres || movie.genres.length === 0) return [];
    return movie.genres.map((g: any) => g.name);
  };

  const previewUrl = getPreviewUrl();
  const duration = formatDuration(movie.duration);
  const genres = getGenreList();

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* HERO SECTION */}
        <View style={styles.heroSection}>
          {previewUrl ? (
            <Image
              source={{ uri: previewUrl }}
              style={styles.previewImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={400}
              placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
            />
          ) : (
            <LinearGradient
              colors={['rgba(255, 77, 109, 0.2)', 'rgba(18, 0, 31, 0.9)']}
              style={styles.previewPlaceholder}
            >
              <Ionicons name="film-outline" size={80} color="#FF4D6D" />
            </LinearGradient>
          )}

          <LinearGradient
            colors={[
              'rgba(0, 0, 0, 0.3)',
              'transparent',
              'transparent',
              'rgba(0, 0, 0, 0.6)',
              'rgba(0, 0, 0, 0.95)',
            ]}
            locations={[0, 0.2, 0.4, 0.7, 1]}
            style={styles.gradientOverlay}
          />

          <TouchableOpacity 
            style={[styles.backButton, { top: insets.top + 10 }]} 
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.heroContent}>
            <Text style={styles.movieTitle}>{movie.name}</Text>

            <View style={styles.metaRow}>
              {duration ? (
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.metaText}>{duration}</Text>
                </View>
              ) : null}
              
              {genres.length > 0 && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaText}>{genres.join(' • ')}</Text>
                </View>
              )}
            </View>

            <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.playButton}
              activeOpacity={0.85}
              onPress={handlePlay}
              data-testid="play-button"
            >
              <LinearGradient
                colors={['#FF4D6D', '#E63946']}
                style={styles.playButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="play" size={28} color="#FFFFFF" />
                <Text style={styles.playButtonText}>
                  {isDownloaded ? 'Play' : 'Stream'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Download Button */}
            <TouchableOpacity
              style={[
                styles.downloadButton,
                isDownloaded && styles.downloadButtonDone,
                (isDownloading || isPending) && styles.downloadButtonActive,
              ]}
              activeOpacity={0.85}
              onPress={handleDownload}
              disabled={isDownloading || isPending || isDownloaded}
              data-testid="download-button"
            >
              {isDownloaded ? (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <Text style={[styles.downloadButtonText, { color: '#10B981' }]}>
                    Downloaded
                  </Text>
                </>
              ) : isDownloading ? (
                <>
                  {/* <ActivityIndicator size="small" color="#FF4D6D" />
                  <Text style={styles.downloadButtonText}>
                    {Math.round(downloadProgress * 100)}%
                  </Text> */}
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <Text style={[styles.downloadButtonText, { color: '#10B981' }]}>
                    Downloading..
                  </Text>
                </>
                
              ) : isPending ? (
                <>
                  <Ionicons name="time-outline" size={20} color="#F59E0B" />
                  <Text style={[styles.downloadButtonText, { color: '#F59E0B' }]}>
                    Queued
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="download-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.downloadButtonText}>Download</Text>
                </>
              )}
            </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* DETAILS SECTION */}
        <View style={styles.detailsSection}>
          {movie.synopsis ? (
            <View style={styles.synopsisContainer}>
              <Text style={styles.sectionLabel}>Synopsis</Text>
              <Text style={styles.synopsisText}>{movie.synopsis}</Text>
            </View>
          ) : null}

          {movie.release_date && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Release Date</Text>
              <Text style={styles.infoValue}>{movie.release_date.substring(0, 10)}</Text>
            </View>
          )}

          {movie.content_type && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Type</Text>
              <Text style={styles.infoValue}>
                {movie.content_type === 1 ? 'Movie' : movie.content_type === 4 ? 'Short Video' : `Type ${movie.content_type}`}
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: insets.bottom + 30 }} />
      </ScrollView>

      {/* ═══════════════════════════════════════════════════════════════════
          MEDIA HUB NOT CONNECTED DIALOG
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal
        transparent
        visible={showHubNotConnectedDialog}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowHubNotConnectedDialog(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCentered}>
            <View style={styles.hubNotConnectedDialog}>
              <View style={styles.hubIconContainer}>
                <Ionicons name="wifi-outline" size={48} color="#F59E0B" />
              </View>
              <Text style={styles.hubDialogTitle}>Media Hub Not Connected</Text>
              <Text style={styles.hubDialogMessage}>
                Please connect to a {COMPANY_NAME} Media Hub to play content.
              </Text>
              
              <TouchableOpacity
                style={styles.hubDialogBtn}
                onPress={() => setShowHubNotConnectedDialog(false)}
              >
                <Text style={styles.hubDialogBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          ERROR DIALOG (status.code != 0)
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal
        transparent
        visible={showErrorDialog}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowErrorDialog(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCentered}>
            <View style={styles.errorDialog}>
              <View style={styles.errorIconContainer}>
                <Ionicons name="lock-closed" size={48} color="#EF4444" />
              </View>
              <Text style={styles.errorTitle}>Playback Not Allowed</Text>
              <Text style={styles.errorMessage}>{errorMessage}</Text>
              {rightsResult && (
                <Text style={styles.errorCode}>
                  Status Code: {rightsResult.statusCode}
                </Text>
              )}
              <TouchableOpacity
                style={styles.errorDismissBtn}
                onPress={() => setShowErrorDialog(false)}
              >
                <Text style={styles.errorDismissBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          DEBUG DIALOG (shows validation progress)
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal
        transparent
        visible={showDebugDialog}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowDebugDialog(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => !isCheckingRights && setShowDebugDialog(false)}
        />
        <View style={styles.modalCentered} pointerEvents="box-none">
          <View style={styles.debugDialog}>
            <View style={styles.debugHeader}>
              <Ionicons name="play-circle" size={24} color="#FF4D6D" />
              <Text style={styles.debugTitle}>Playback Validation</Text>
              {!isCheckingRights && (
                <TouchableOpacity onPress={() => setShowDebugDialog(false)}>
                  <Ionicons name="close" size={24} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={styles.debugScrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.debugContent}>
                {/* Rights Check Status */}
                <View style={styles.debugSection}>
                  <Text style={styles.debugSectionTitle}>get_download_right</Text>
                  {isCheckingRights ? (
                    <View style={styles.loadingBox}>
                      <ActivityIndicator size="small" color="#FF4D6D" />
                      <Text style={styles.loadingText}>Checking playback rights...</Text>
                    </View>
                  ) : rightsResult ? (
                    <View style={[
                      styles.rightsStatusBox,
                      rightsResult.statusCode === STATUS_CODES.OK ? styles.rightsAllowed : styles.rightsDenied
                    ]}>
                      <Ionicons 
                        name={rightsResult.statusCode === STATUS_CODES.OK ? "checkmark-circle" : "close-circle"} 
                        size={24} 
                        color={rightsResult.statusCode === STATUS_CODES.OK ? "#10B981" : "#EF4444"} 
                      />
                      <View style={styles.rightsTextContainer}>
                        <Text style={[
                          styles.rightsStatusTitle,
                          rightsResult.statusCode === STATUS_CODES.OK ? styles.rightsAllowedText : styles.rightsDeniedText
                        ]}>
                          status.code = {rightsResult.statusCode}
                        </Text>
                        <Text style={styles.rightsStatusSubtitle}>
                          {rightsResult.message}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  
                  {rightsResult && (
                    <View style={[styles.debugInfoBox, { marginTop: 8 }]}>
                      <View style={styles.debugInfoRow}>
                        <Text style={styles.debugLabel}>Movie ID:</Text>
                        <Text style={styles.debugValue}>{rightsResult.debugInfo.movieId}</Text>
                      </View>
                      <View style={styles.debugInfoRow}>
                        <Text style={styles.debugLabel}>RandomKey:</Text>
                        <Text style={[styles.debugValue, styles.debugValueSmall]}>
                          {rightsResult.randomKey || 'Not received'}
                        </Text>
                      </View>
                      <View style={styles.debugInfoRow}>
                        <Text style={styles.debugLabel}>Hub URL:</Text>
                        <Text style={[styles.debugValue, styles.debugValueSmall]} numberOfLines={1}>
                          {rightsResult.debugInfo.requestUrl}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* URL Construction - Only show if rights granted */}
                {rightsResult?.statusCode === STATUS_CODES.OK && playbackResult && (
                  <View style={styles.debugSection}>
                    <Text style={styles.debugSectionTitle}>Playback URL</Text>
                    <View style={styles.debugInfoBox}>
                      <View style={styles.debugInfoRow}>
                        <Text style={styles.debugLabel}>fileName:</Text>
                        <Text style={styles.debugValue}>{playbackResult.debugInfo.normalizedFileName || 'N/A'}</Text>
                      </View>
                      <View style={styles.debugInfoRow}>
                        <Text style={styles.debugLabel}>BASE_URL:</Text>
                        <Text style={[styles.debugValue, styles.debugValueSmall]} numberOfLines={1}>
                          {playbackResult.debugInfo.baseUrlSelected}
                        </Text>
                      </View>
                      <View style={styles.debugUrlSection}>
                        <Text style={styles.debugLabel}>Final m3u8 URL:</Text>
                        <Text style={styles.debugUrlValue} numberOfLines={3}>
                          {playbackResult.debugInfo.finalUrl}
                        </Text>
                      </View>
                      <View style={styles.debugUrlSection}>
                        <Text style={styles.debugLabel}>Cookie:</Text>
                        <Text style={[styles.debugUrlValue, { color: '#F59E0B' }]} numberOfLines={2}>
                          {playbackResult.debugInfo.headersApplied.cookie || 'none'}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>

            {!isCheckingRights && (
              <View style={styles.dialogButtons}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowDebugDialog(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.playNowBtn,
                    (!playbackResult?.success || rightsResult?.statusCode !== STATUS_CODES.OK) && styles.playNowBtnDisabled
                  ]}
                  onPress={navigateToPlayer}
                  disabled={!playbackResult?.success || rightsResult?.statusCode !== STATUS_CODES.OK}
                >
                  <Ionicons name="play" size={20} color="#FFF" />
                  <Text style={styles.playNowBtnText}>Play Now</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    color: '#9CA3AF',
    marginTop: 16,
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: '#FF4D6D',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  errorButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  heroSection: {
    width: SCREEN_WIDTH,
    height: PREVIEW_HEIGHT,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  movieTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  playButton: {
    borderRadius: 30,
    overflow: 'hidden',
    flex: 1,
  },
  playButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 10,
  },
  playButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 30,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flex: 1,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  downloadButtonDone: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  downloadButtonActive: {
    borderColor: 'rgba(255,77,109,0.5)',
    backgroundColor: 'rgba(255,77,109,0.08)',
  },
  downloadButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  detailsSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    backgroundColor: '#000000',
  },
  synopsisContainer: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  synopsisText: {
    fontSize: 15,
    color: '#9CA3AF',
    lineHeight: 24,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 14,
    color: '#E5E7EB',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  // Hub Not Connected Dialog
  hubNotConnectedDialog: {
    width: '85%',
    maxWidth: 340,
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  hubIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  hubDialogTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  hubDialogMessage: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  hubDialogInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    width: '100%',
  },
  hubDialogInfoText: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  hubDialogBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 12,
  },
  hubDialogBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  // Error Dialog
  errorDialog: {
    width: '85%',
    maxWidth: 320,
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  errorCode: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  errorDismissBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errorDismissBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  // Debug Dialog
  debugDialog: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 109, 0.3)',
  },
  debugHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 77, 109, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  debugTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
    marginLeft: 12,
  },
  debugScrollView: {
    maxHeight: 400,
  },
  debugContent: {
    padding: 20,
  },
  debugSection: {
    marginTop: 16,
  },
  debugSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF4D6D',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  debugInfoBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
  },
  debugInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  debugLabel: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  debugValue: {
    fontSize: 12,
    color: '#FFFFFF',
    fontFamily: 'monospace',
    fontWeight: '600',
    maxWidth: '60%',
  },
  debugValueSmall: {
    fontSize: 10,
  },
  debugUrlSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  debugUrlValue: {
    fontSize: 10,
    color: '#6EE7B7',
    fontFamily: 'monospace',
    marginTop: 4,
    lineHeight: 14,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 77, 109, 0.1)',
    padding: 14,
    borderRadius: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  rightsStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  rightsAllowed: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  rightsDenied: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  rightsTextContainer: {
    flex: 1,
  },
  rightsStatusTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  rightsAllowedText: {
    color: '#10B981',
  },
  rightsDeniedText: {
    color: '#EF4444',
  },
  rightsStatusSubtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  dialogButtons: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  playNowBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF4D6D',
    paddingVertical: 14,
    borderRadius: 12,
  },
  playNowBtnDisabled: {
    backgroundColor: '#4B5563',
  },
  playNowBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
