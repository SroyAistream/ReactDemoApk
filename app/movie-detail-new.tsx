import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHubDetection } from '../core/hooks/useHubDetection';
import { getPlaybackUrl } from '../core/services/PlaybackService';
import { checkDownloadRights } from '../core/services/DownloadRightsService';

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

  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [showHubNotConnectedDialog, setShowHubNotConnectedDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Parse the movie object from params
  const movie = params.movie ? JSON.parse(params.movie as string) : null;

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
    
    // Re-detect hub connection first
    detectHub();

    // Reset error state
    setErrorMessage('');

    if (!isHubConnected) {
      setShowHubNotConnectedDialog(true);
      return;
    }

    // Call get_download_right API
    const rights = await checkDownloadRights(movieId, isHubConnected);

    // IF status.code != 0: show error dialog, STOP playback flow
    if (rights.statusCode !== 0) {
      setErrorMessage(rights.message || 'Playback not allowed');
      setShowErrorDialog(true);
      return;
    }

    // IF status.code == 0: build URL and navigate directly to player
    const result = await getPlaybackUrl(movie, isHubConnected);

    if (result.success) {
      router.push({
        pathname: '/player' as any,
        params: {
          playbackUrl: result.playbackUrl,
          movieName: movie?.name || 'Video',
          headers: JSON.stringify(result.headers),
        },
      });
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
  
  const getPreviewUrl = (): string | null => {
    let previewPath: string | null = null;
    
    if (movie.preview && movie.preview.trim() !== '') {
      previewPath = movie.preview;
    } else if (movie.theatrical_poster && movie.theatrical_poster.trim() !== '') {
      previewPath = movie.theatrical_poster;
    } else if (movie.poster && movie.poster.trim() !== '') {
      previewPath = movie.poster;
    }

    if (!previewPath) return null;

    const base = IMAGE_BASE_URL.endsWith('/') ? IMAGE_BASE_URL : IMAGE_BASE_URL + '/';
    const path = previewPath.startsWith('/') ? previewPath.slice(1) : previewPath;
    return base + path;
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
                <Text style={styles.playButtonText}>Play</Text>
              </LinearGradient>
            </TouchableOpacity>
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
                Please connect to a Media Hub router to play content.
              </Text>
              <View style={styles.hubDialogInfo}>
                <Text style={styles.hubDialogInfoText}>
                  Current Gateway: {gatewayIp || 'Unknown'}
                </Text>
                <Text style={styles.hubDialogInfoText}>
                  Required Gateway: {HUB_GATEWAY_IP}
                </Text>
              </View>
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
  playButton: {
    borderRadius: 30,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  playButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 36,
    gap: 10,
  },
  playButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
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
});
