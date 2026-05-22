import React, { useEffect, useState, memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { STORAGE_KEYS } from '../core/constants/api_constants';
import { storageHelper } from '../core/utils/storage_helper';
import { useMoviesStore } from '../features/movies/presentation/providers/movies_provider';
import { MovieResponse } from '../features/movies/domain/entities/movie';
import { useHubDetection } from '../core/hooks/useHubDetection';
import { useDownloadsStore } from '../features/downloads/presentation/providers/downloads_provider';
import { useProfileStore } from '../features/profile/presentation/providers/profile_provider';
import { useRoutersStore } from '../features/routers/presentation/providers/routers_provider';

// ─────────────────────────────────────────────
// Constants (match Android Java Config.java)
// ─────────────────────────────────────────────
/** Poster image base URL — mirrors Java Config.picURLPath. CORS resolved. */
const POSTER_BASE_URL = 'https://demo.aistream.tv:8833/';

// ─────────────────────────────────────────────
// Section IDs (Android HomeAdapter)
// ─────────────────────────────────────────────
const SECTION_HOT_MOVIES = -1;
const SECTION_RECOMMENDED = -2;
const SECTION_MOVIES = -3;
const SECTION_ENTERTAINMENT = -4;
const SECTION_EDUCATION = -5;
const SECTION_RELIGION = -6;
const SECTION_OTHERS = -7;

// ─────────────────────────────────────────────
// Content Type Constants (Android-equivalent)
// ─────────────────────────────────────────────
const CONTENT_TYPE_MOVIE = 1;       // Full-length movies
const CONTENT_TYPE_SHORT_VIDEO = 4; // Short videos

// Video Type IDs for short videos (content_type == 4)
const VIDEO_TYPE_ENTERTAINMENT = 1;
const VIDEO_TYPE_EDUCATION = 2;
const VIDEO_TYPE_RELIGION = 3;
const VIDEO_TYPE_OTHERS = 4;

// ─────────────────────────────────────────────
// Types (aligned with real API response)
// ─────────────────────────────────────────────
interface GenreItem {
  id: number;
  name: string;
}

interface VideoType {
  id: number;
  name: string;
}

/** CDN domain entry – kept for type-checking API responses only, NOT used for poster URLs */
interface ResourceDomain {
  cdnaddress1: string;
  cdnaddress2?: string;
  priority?: number;
}

interface Movie {
  movie_id: number;
  name: string;
  synopsis?: string;
  /**
   * Java: movie.getPoster() – relative path.
   * Full URL = Config.picURLPath + movie.getPoster()
   * i.e. POSTER_BASE_URL + poster
   */
  poster?: string;
  theatrical_poster?: string;
  preview?: string;
  poster_url?: string;         // mock data: full URL already
  duration?: number;           // in seconds (real API)
  star_score?: string;
  rating?: number;
  genres?: GenreItem[];
  type?: number;
  vip?: number;
  release_date?: string;
  content_type?: number;       // 1 = Movie, 4 = Short Video
  video_type?: VideoType;      // For short videos: {id: 1-4, name: string}
  resource_domains?: ResourceDomain[]; // present in API but NOT used for image URL
}

// Genre group within a section
interface GenreGroup {
  genreName: string;
  movies: Movie[];
}

// Section with genre groups (Android HomeAdapter structure)
interface MovieSection {
  sectionId: number;
  sectionTitle: string;
  genreGroups: GenreGroup[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Neutral grey blurhash — shown while the real poster downloads.
// A generic dark-grey placeholder that fits the dark UI theme.
// ─────────────────────────────────────────────────────────────────────────────
const PLACEHOLDER_BLURHASH = 'L02}lN0000%g0000WB9Z9Zt79F-p';



interface MovieCardItemProps {
  movie: Movie;
  posterUrl: string | null;
  duration: string;
  score: number;
  onPress: () => void;
}

/**
 * Wrapped in React.memo so the card only re-renders when its own props change.
 * This prevents every visible card from re-downloading its image when
 * the parent list re-renders (e.g. on scroll or section update).
 */
const MovieCardItem = memo(function MovieCardItem({
  movie,
  posterUrl,
  duration,
  score,
  onPress,
}: MovieCardItemProps) {
  return (
    <TouchableOpacity style={styles.movieCard} activeOpacity={0.9} onPress={onPress}>
      <View style={styles.posterContainer}>

        {/*
         * expo-image gives us for free:
         *  - cachePolicy="memory-disk"  → cached on first load, never re-downloaded
         *  - transition={300}           → smooth 300ms fade-in when image arrives
         *  - placeholder={blurhash}     → soft blurred preview while loading
         *  - contentFit="cover"         → same as resizeMode="cover"
         */}
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            style={styles.poster}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={300}
            placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
            placeholderContentFit="cover"
            onError={() =>
              console.warn(`[Poster FAILED] ${movie.name} → ${posterUrl}`)
            }
          />
        ) : (
          <LinearGradient
            colors={['rgba(255, 77, 109, 0.3)', 'rgba(18, 0, 31, 0.8)']}
            style={styles.posterPlaceholder}
          >
            <Ionicons name="film-outline" size={32} color="#FF4D6D" />
          </LinearGradient>
        )}

        {/* Rating Badge */}
        {score > 0 && (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={10} color="#FFD700" />
            <Text style={styles.ratingText}>{score.toFixed(1)}</Text>
          </View>
        )}

        {/* VIP Badge */}
        {(movie.vip === 1 || movie.type === 2) && (
          <View style={styles.vipBadge}>
            <Text style={styles.vipText}>VIP</Text>
          </View>
        )}

        {/* Play Button */}
        <View style={styles.playButton}>
          <Ionicons name="play" size={16} color="#FFFFFF" />
        </View>
      </View>

      <View style={styles.movieInfo}>
        <Text style={styles.movieTitle} numberOfLines={2}>{movie.name}</Text>
        {duration ? <Text style={styles.movieDuration}>{duration}</Text> : null}
      </View>
    </TouchableOpacity>
  );
});





export default function HomeScreen() {
  const router = useRouter();
  const [sections, setSections] = useState<MovieSection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { processPendingDownloads } = useDownloadsStore();

  // 1. Initialize the detection hook
  const { isHubConnected } = useHubDetection();

  // Use the offline-first movies store
  const { movies, isLoading, isRefreshing, fetchMovies } = useMoviesStore();
  const {fetchProfile } = useProfileStore();
      const { fetchRouters } = useRoutersStore();

  const initializeData = async () => {
  try {
    // If not on Hub (meaning on Internet), we force a refresh to overwrite cache
    // If on Hub, we don't force a refresh, so it just hits 'Step 1: Load Cache'
    const shouldForceUpdate = !isHubConnected;

    console.log(`[Index] Syncing. Hub: ${isHubConnected}, ForceUpdate: ${shouldForceUpdate}`);

    
    
    if (!isHubConnected) {
      // Only sync these if we actually have an internet connection
      // Sequential calls to prevent SQLite transaction collisions
    await fetchMovies(isHubConnected, shouldForceUpdate);
      await fetchRouters(isHubConnected); 
      await fetchProfile(isHubConnected, true);
    }
    
    console.log('[Index] Sequential sync completed.');
  } catch (err) {
    console.error("[Index] Initialization failed:", err);
  }
};

  useEffect(() => {
    const initializeData = async () => {
      try {
        // Always load cache first on a cold start to ensure something is on screen instantly
        if (movies.length === 0) {
          await fetchMovies(isHubConnected, false); 
        }

        // Now handle the background syncing strategy once the hook is ready
        const shouldForceUpdate = !isHubConnected;
        console.log(`[Index] App Cold Start Syncing. Hub: ${isHubConnected}`);

        await fetchMovies(isHubConnected, shouldForceUpdate);
        
      } catch (err) {
        console.error("[Index] Cold start initialization failed:", err);
      }
    };

      initializeData();
  }, [isHubConnected]);

  // useEffect(() => {
  //   // Load movies on mount (cache-first, then background sync)
  //   // Passing isHubConnected ensures the database saves the correct poster URLs
  //  initializeData()
  // }, [isHubConnected]);

  // Categorize movies whenever they change
  useEffect(() => {
    if (movies.length > 0) {
      const categorizedSections = categorizeMovies(movies as Movie[]);
      setSections(categorizedSections);
    }
  }, [movies]);

  useEffect(() => {
      if (isHubConnected) {
        // Fire-and-forget: process any pending downloads in background
        console.log('[Auto-Sync] Media Hub detected! Starting pending downloads...');
        processPendingDownloads(true);
      }
    }, [isHubConnected]);
  

  // This function adds the button to your navigation bar
  const navigateToDownloads = () => {
    router.push('/DownloadsScreen'); // Assumes your file is app/downloads.tsx
  };

  // Pull-to-refresh handler
  const onRefresh = useCallback(() => {
    // Note: We don't necessarily need to clear sections here if we want to 
    // keep the old data visible until the refresh completes, but keeping 
    // it matches your current UI clear-and-reload preference.
    setError(null);
    // setSections([]);
    fetchMovies(isHubConnected,true); // forceRefresh = true
  }, [fetchMovies,isHubConnected]);

  /**
   * Categorize movies following Android HomeAdapter behavior.
   * 
   * Sections are built manually in this EXACT order:
   * 1. Hot Movies    - Top rated movies (content_type == 1) by star_score
   * 2. Recommended   - Free movies (content_type == 1, type == 1)
   * 3. Movies        - All movies (content_type == 1)
   * 4. Entertainment - Short videos (content_type == 4, video_type.id == 1)
   * 5. Education     - Short videos (content_type == 4, video_type.id == 2)
   * 6. Religion      - Short videos (content_type == 4, video_type.id == 3)
   * 7. Others        - Short videos (content_type == 4, video_type.id == 4)
   * 
   * Inside each section, movies are grouped by genre.name.
   * A movie may belong to multiple genres (duplicated into each matching genre group).
   * Empty sections and genres are hidden.
   */
  const categorizeMovies = (movies: Movie[]): MovieSection[] => {
    const result: MovieSection[] = [];

    // Helper: get numeric star score
    const getScore = (m: Movie): number =>
      parseFloat(m.star_score ?? String(m.rating ?? 0)) || 0;

    /**
     * Group movies by genre.name within a section.
     * A movie with multiple genres is duplicated into each genre group.
     * Movies without genres go into "Uncategorized".
     */
    const groupByGenre = (sectionMovies: Movie[]): GenreGroup[] => {
      const genreMap = new Map<string, Movie[]>();

      sectionMovies.forEach((movie) => {
        const genres = movie.genres ?? [];
        if (genres.length === 0) {
          // Movie has no genres - put in "Uncategorized"
          const key = 'Uncategorized';
          if (!genreMap.has(key)) {
            genreMap.set(key, []);
          }
          genreMap.get(key)!.push(movie);
        } else {
          // Duplicate movie into each genre group
          genres.forEach((genre) => {
            const genreName = genre.name || 'Uncategorized';
            if (!genreMap.has(genreName)) {
              genreMap.set(genreName, []);
            }
            genreMap.get(genreName)!.push(movie);
          });
        }
      });

      // Convert map to array, sorted alphabetically by genre name
      const groups: GenreGroup[] = [];
      [...genreMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([genreName, movies]) => {
          if (movies.length > 0) {
            groups.push({ genreName, movies });
          }
        });

      return groups;
    };

    /**
     * Create a section with genre groups if there are any movies.
     */
    const createSection = (
      sectionId: number,
      sectionTitle: string,
      sectionMovies: Movie[]
    ): MovieSection | null => {
      if (sectionMovies.length === 0) return null;

      const genreGroups = groupByGenre(sectionMovies);
      if (genreGroups.length === 0) return null;

      return {
        sectionId,
        sectionTitle,
        genreGroups,
      };
    };

    // Filter movies by content_type
    const fullMovies = movies.filter((m) => m.content_type === CONTENT_TYPE_MOVIE);
    const shortVideos = movies.filter((m) => m.content_type === CONTENT_TYPE_SHORT_VIDEO);

    // ── 1. HOT MOVIES ───────────────────────────────────────────────────────
    const scoredMovies = fullMovies.filter((m) => getScore(m) > 0);
    const hotMovies = scoredMovies.length > 0
      ? [...scoredMovies].sort((a, b) => getScore(b) - getScore(a)).slice(0, 10)
      : [...fullMovies].slice(0, 10);

    const hotSection = createSection(SECTION_HOT_MOVIES, 'HOT MOVIES', hotMovies);
    if (hotSection) result.push(hotSection);

    // ── 2. RECOMMENDED ──────────────────────────────────────────────────────
    const recommendedMovies = fullMovies.filter((m) => m.type === 1).slice(0, 10);
    const recommendedSection = createSection(SECTION_RECOMMENDED, 'RECOMMENDED', recommendedMovies);
    if (recommendedSection) result.push(recommendedSection);

    // ── 3. MOVIES ───────────────────────────────────────────────────────────
    const moviesSection = createSection(SECTION_MOVIES, 'MOVIES', fullMovies);
    if (moviesSection) result.push(moviesSection);

    // ── 4. ENTERTAINMENT ────────────────────────────────────────────────────
    const entertainmentVideos = shortVideos.filter(
      (m) => m.video_type?.id === VIDEO_TYPE_ENTERTAINMENT
    );
    const entertainmentSection = createSection(SECTION_ENTERTAINMENT, 'ENTERTAINMENT', entertainmentVideos);
    if (entertainmentSection) result.push(entertainmentSection);

    // ── 5. EDUCATION ────────────────────────────────────────────────────────
    const educationVideos = shortVideos.filter(
      (m) => m.video_type?.id === VIDEO_TYPE_EDUCATION
    );
    const educationSection = createSection(SECTION_EDUCATION, 'EDUCATION', educationVideos);
    if (educationSection) result.push(educationSection);

    // ── 6. RELIGION ─────────────────────────────────────────────────────────
    const religionVideos = shortVideos.filter(
      (m) => m.video_type?.id === VIDEO_TYPE_RELIGION
    );
    const religionSection = createSection(SECTION_RELIGION, 'RELIGION', religionVideos);
    if (religionSection) result.push(religionSection);

    // ── 7. OTHERS ───────────────────────────────────────────────────────────
    const othersVideos = shortVideos.filter(
      (m) => m.video_type?.id === VIDEO_TYPE_OTHERS
    );
    const othersSection = createSection(SECTION_OTHERS, 'OTHERS', othersVideos);
    if (othersSection) result.push(othersSection);

    return result;
  };

  /**
   * Format duration following Android Java pattern.
   * Real API returns duration in SECONDS → convert to Xh Ym.
   * e.g. 3600 sec → "1h", 360 sec → "6m", 7380 sec → "2h 3m"
   */
  const formatDuration = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return '';
    const totalMinutes = Math.round(seconds / 60);
    const hrs  = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
    if (hrs > 0)              return `${hrs}h`;
    return `${mins}m`;
  };

  /**
   * Get numeric star score from either star_score (string) or rating (number).
   */
  const getStarScore = (movie: Movie): number =>
    parseFloat(movie.star_score ?? String(movie.rating ?? 0)) || 0;

  /**
   * Constructs the full poster URL – exact Java pattern from all adapters:
   *
   *   Java (ItemAdapterMovie, ViewPageAdapter, SearchRecycleAdapter, etc.):
   *     String fullUrl = Config.picURLPath + movie.getPoster();
   *
   * Config.picURLPath = "https://demo.aistream.tv:88/"
   *
   * NOTE: resource_domains is present in the API response but is NEVER used
   * for image URLs anywhere in the Java source code (0 occurrences).
   */
  const getPosterUrl = (movie: Movie): string | null => {
    // Mock data: poster_url is already a full URL
    if (movie.poster_url && movie.poster_url.startsWith('http')) {
      return movie.poster_url;
    }

    // Prefer poster → theatrical_poster → preview (same priority as Java getPoster())
    const relativePath =
      movie.poster ??
      movie.theatrical_poster ??
      movie.preview ??
      null;

    if (!relativePath) return null;

    // Java: Config.picURLPath + movie.getPoster()
    const base = POSTER_BASE_URL.endsWith('/') ? POSTER_BASE_URL : POSTER_BASE_URL + '/';
    const path = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    return base + path;
  };

  const handleLogout = async () => {
    await storageHelper.removeItem(STORAGE_KEYS.TOKEN);
    await storageHelper.removeItem(STORAGE_KEYS.IS_LOGGED_IN);
    router.replace('/');
  };

  /**
   * Render a single genre group with horizontal movie list.
   */
  const renderGenreGroup = (genreGroup: GenreGroup, sectionId: number) => {
    if (genreGroup.movies.length === 0) return null;

    return (
      <View key={`${sectionId}-${genreGroup.genreName}`} style={styles.genreGroup}>
        
        <View style={styles.genreHeader}>
          <Text style={styles.genreTitle}>{genreGroup.genreName}</Text>
          {genreGroup.movies.length > 4 && (
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
        >
          {genreGroup.movies.slice(0, 10).map((movie, index) => {
            const posterUrl = getPosterUrl(movie);
            const duration  = formatDuration(movie.duration);
            const score     = getStarScore(movie);
            return (
              <MovieCardItem
                key={`${movie.movie_id}-${index}`}
                movie={movie}
                posterUrl={posterUrl}
                duration={duration}
                score={score}
                onPress={() => {
                  // Navigate to movie detail, passing movie as JSON string
                  router.push({
                    pathname: '/movie-detail',
                    params: { movie: JSON.stringify(movie) },
                  });
                }}
              />
            );
          })}
        </ScrollView>
      </View>
    );
  };

  /**
   * Render a section with its genre groups.
   * Hierarchy: Section Title → Genre Title → Horizontal movie list
   */
  const renderSection = (section: MovieSection) => {
    if (section.genreGroups.length === 0) return null;

    return (
      <View key={section.sectionId} style={styles.section}>
        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.sectionTitle}</Text>
        </View>

        {/* Genre Groups within the section */}
        {section.genreGroups.map((genreGroup) =>
          renderGenreGroup(genreGroup, section.sectionId)
        )}
      </View>
    );
  };

  if (isLoading && sections.length === 0) {
    return (
      <LinearGradient colors={['#12001F', '#000000']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF4D6D" />
          <Text style={styles.loadingText}>Loading movies...</Text>
        </View>
      </LinearGradient>
    );
  }

  // Count total genre groups across all sections
  const totalGenreGroups = sections.reduce((sum, s) => sum + s.genreGroups.length, 0);

  return (
    <LinearGradient colors={['#12001F', '#000000']} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
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
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Discover</Text>
            <Text style={styles.headerSubtitle}>{sections.length} sections</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/hotspot')}>
              <Ionicons name="wifi" size={22} color="#10B981" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/account')}>
              <Ionicons name="person-circle-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            {/* <View style={styles.header1}> */}
        {/* <Text style={styles.title}>AiStream</Text> */}
        <TouchableOpacity onPress={navigateToDownloads} style={styles.downloadIcon}>
          <Ionicons name="download-outline" size={26} color="#FFF" />
          {/* Optional: Add a small red dot if there are active downloads */}
        </TouchableOpacity>
      {/* </View> */}
            <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={22} color="#FF4D6D" />
            </TouchableOpacity>
          </View>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color="#FF4D6D" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Movie Sections - following Android HomeAdapter */}
        {sections.map(section => renderSection(section))}

        {sections.length === 0 && !error && (
          <View style={styles.emptyContainer}>
            <Ionicons name="film-outline" size={64} color="#6B7280" />
            <Text style={styles.emptyText}>No movies found</Text>
            <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
              <Text style={styles.retryButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#9CA3AF',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 109, 0.3)',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 77, 109, 0.1)',
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#FF4D6D',
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 77, 109, 0.2)',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FF4D6D',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  genreGroup: {
    marginBottom: 16,
  },
  genreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  genreTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E5E7EB',
    letterSpacing: 0.3,
  },
  seeAllText: {
    fontSize: 13,
    color: '#FF4D6D',
    fontWeight: '600',
  },
  horizontalList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  movieCard: {
    width: 130,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 109, 0.15)',
  },
  posterContainer: {
    width: '100%',
    aspectRatio: 2 / 3,
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  vipBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#FF4D6D',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  vipText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  playButton: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 77, 109, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  movieInfo: {
    padding: 10,
  },
  movieTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  movieDuration: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#FF4D6D',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  bottomPadding: {
    height: 40,
  },
  header1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#000',
  },
  title: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '700',
  },
  downloadIcon: {
    padding: 4,
  },
});
