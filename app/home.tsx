import React, { useEffect, useState, memo, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMoviesStore } from '../features/movies/presentation/providers/movies_provider';
import { useHubDetection } from '../core/hooks/useHubDetection';
import { useDownloadsStore } from '../features/downloads/presentation/providers/downloads_provider';
import { getBaseUrl } from '../core/config/app_config';
import { clearAllAppCache } from '../core/services/app_cache';

const SECTION_HOT_MOVIES = -1;
const SECTION_RECOMMENDED = -2;
const SECTION_MOVIES = -3;
const SECTION_ENTERTAINMENT = -4;
const SECTION_EDUCATION = -5;
const SECTION_RELIGION = -6;
const SECTION_OTHERS = -7;

const CONTENT_TYPE_MOVIE = 1;       
const CONTENT_TYPE_SHORT_VIDEO = 4; 

const VIDEO_TYPE_ENTERTAINMENT = 1;
const VIDEO_TYPE_EDUCATION = 2;
const VIDEO_TYPE_RELIGION = 3;
const VIDEO_TYPE_OTHERS = 4;

interface GenreItem {
  id: number;
  name: string;
}

interface VideoType {
  id: number;
  name: string;
}

interface ResourceDomain {
  cdnaddress1: string;
  cdnaddress2?: string;
  priority?: number;
}

interface Movie {
  movie_id: number;
  name: string;
  synopsis?: string;
  poster?: string;
  theatrical_poster?: string;
  preview?: string;
  poster_url?: string;         
  duration?: number;           
  star_score?: string;
  rating?: number;
  genres?: GenreItem[];
  type?: number;
  vip?: number;
  country?: string;
  release_date?: string;
  content_type?: number;       
  video_type?: VideoType;      
  resource_domains?: ResourceDomain[]; 
}

interface GenreGroup {
  genreName: string;
  movies: Movie[];
}

interface MovieSection {
  sectionId: number;
  sectionTitle: string;
  genreGroups: GenreGroup[];
}

const PLACEHOLDER_BLURHASH = 'L02}lN0000%g0000WB9Z9Zt79F-p';

interface MovieCardItemProps {
  movie: Movie;
  posterUrl: string | null;
  duration: string;
  score: number;
  onPress: () => void;
}

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
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            style={styles.poster}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={300}
            placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
            placeholderContentFit="cover"
          />
        ) : (
          <LinearGradient
            colors={['rgba(255, 77, 109, 0.3)', 'rgba(18, 0, 31, 0.8)']}
            style={styles.posterPlaceholder}
          >
            <Ionicons name="film-outline" size={32} color="#FF4D6D" />
          </LinearGradient>
        )}

        {score > 0 && (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={10} color="#FFD700" />
            <Text style={styles.ratingText}>{score.toFixed(1)}</Text>
          </View>
        )}

        {(movie.vip === 1 || movie.type === 2) && (
          <View style={styles.vipBadge}>
            <Text style={styles.vipText}>VIP</Text>
          </View>
        )}

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
  const [searchQuery, setSearchQuery] = useState('');
  const { processPendingDownloads } = useDownloadsStore();
  const { isHubConnected } = useHubDetection();

  const { movies, isLoading, isRefreshing, fetchMovies } = useMoviesStore();

  useEffect(() => {
    const initializeData = async () => {
      try {
        await fetchMovies(isHubConnected, false);
      } catch (err) {
        console.error("[Index] Cold start initialization failed:", err);
      }
    };
    initializeData();
  }, [isHubConnected]);

  const filteredMovies = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const allMovies = movies as Movie[];

    if (!query) return allMovies;

    return allMovies.filter((movie) => {
      const genreText = (movie.genres ?? []).map((genre) => genre.name).join(' ');
      const videoType = movie.video_type?.name ?? '';
      const contentKind = movie.content_type === CONTENT_TYPE_SHORT_VIDEO ? 'short video' : 'movie';

      return [
        movie.name,
        movie.synopsis,
        genreText,
        videoType,
        contentKind,
        movie.country,
        movie.release_date,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [movies, searchQuery]);

  useEffect(() => {
    const categorizedSections = categorizeMovies(filteredMovies);
    setSections(categorizedSections);
  }, [filteredMovies]);

  useEffect(() => {
    if (isHubConnected) {
      console.log('[Auto-Sync] Media Hub detected! Starting pending downloads...');
      processPendingDownloads(true);
    }
  }, [isHubConnected]);
  
  const navigateToDownloads = () => {
    router.push('/DownloadsScreen'); 
  };

  const onRefresh = useCallback(() => {
    setError(null);
    fetchMovies(isHubConnected, true); 
  }, [fetchMovies, isHubConnected]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const categorizeMovies = (movies: Movie[]): MovieSection[] => {
    const result: MovieSection[] = [];

    const getScore = (m: Movie): number =>
      parseFloat(m.star_score ?? String(m.rating ?? 0)) || 0;

    const groupByGenre = (sectionMovies: Movie[]): GenreGroup[] => {
      const genreMap = new Map<string, Movie[]>();

      sectionMovies.forEach((movie) => {
        const genres = movie.genres ?? [];
        if (genres.length === 0) {
          const key = 'Uncategorized';
          if (!genreMap.has(key)) genreMap.set(key, []);
          genreMap.get(key)!.push(movie);
        } else {
          genres.forEach((genre) => {
            const genreName = genre.name || 'Uncategorized';
            if (!genreMap.has(genreName)) genreMap.set(genreName, []);
            genreMap.get(genreName)!.push(movie);
          });
        }
      });

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

    const fullMovies = movies.filter((m) => m.content_type === CONTENT_TYPE_MOVIE);
    const shortVideos = movies.filter((m) => m.content_type === CONTENT_TYPE_SHORT_VIDEO);

    const scoredMovies = fullMovies.filter((m) => getScore(m) > 0);
    const hotMovies = scoredMovies.length > 0
      ? [...scoredMovies].sort((a, b) => getScore(b) - getScore(a)).slice(0, 10)
      : [...fullMovies].slice(0, 10);

    const hotSection = createSection(SECTION_HOT_MOVIES, 'HOT MOVIES', hotMovies);
    if (hotSection) result.push(hotSection);

    const recommendedMovies = fullMovies.filter((m) => m.type === 1).slice(0, 10);
    const recommendedSection = createSection(SECTION_RECOMMENDED, 'RECOMMENDED', recommendedMovies);
    if (recommendedSection) result.push(recommendedSection);

    const moviesSection = createSection(SECTION_MOVIES, 'MOVIES', fullMovies);
    if (moviesSection) result.push(moviesSection);

    const entertainmentVideos = shortVideos.filter((m) => m.video_type?.id === VIDEO_TYPE_ENTERTAINMENT);
    const entertainmentSection = createSection(SECTION_ENTERTAINMENT, 'ENTERTAINMENT', entertainmentVideos);
    if (entertainmentSection) result.push(entertainmentSection);

    const educationVideos = shortVideos.filter((m) => m.video_type?.id === VIDEO_TYPE_EDUCATION);
    const educationSection = createSection(SECTION_EDUCATION, 'EDUCATION', educationVideos);
    if (educationSection) result.push(educationSection);

    const religionVideos = shortVideos.filter((m) => m.video_type?.id === VIDEO_TYPE_RELIGION);
    const religionSection = createSection(SECTION_RELIGION, 'RELIGION', religionVideos);
    if (religionSection) result.push(religionSection);

    const othersVideos = shortVideos.filter((m) => m.video_type?.id === VIDEO_TYPE_OTHERS);
    const othersSection = createSection(SECTION_OTHERS, 'OTHERS', othersVideos);
    if (othersSection) result.push(othersSection);

    return result;
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return '';
    const totalMinutes = Math.round(seconds / 60);
    const hrs  = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
    if (hrs > 0)              return `${hrs}h`;
    return `${mins}m`;
  };

  const getStarScore = (movie: Movie): number =>
    parseFloat(movie.star_score ?? String(movie.rating ?? 0)) || 0;

  const getPosterUrl = (movie: Movie): string | null => {
    const rawPath = movie.poster_url ?? movie.poster ?? movie.theatrical_poster ?? movie.preview ?? null;
    if (!rawPath) return null;

    let path = rawPath
      .replace('https://demo.aistream.tv:8833', '')
      .replace('http://konnekt.aistream.tv:88', '')
      .replace('http://192.168.39.20:88', '');

    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    const baseUrl = getBaseUrl(isHubConnected);
    const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    path = path.startsWith('/') ? path.slice(1) : path;
    return base + path;
  };

  const handleLogout = async () => {
    try {
      await clearAllAppCache();
    } catch (error) {
      console.error('Logout cache clear error:', error);
    } finally {
      router.replace('/');
    }
  };

  const renderGenreGroup = (genreGroup: GenreGroup, sectionId: number, sectionTitle: string) => {
    if (genreGroup.movies.length === 0) return null;

    return (
      <View key={`${sectionId}-${genreGroup.genreName}`} style={styles.genreGroup}>
        <View style={styles.genreHeader}>
          <Text style={styles.genreTitle}>{genreGroup.genreName}</Text>
          {genreGroup.movies.length > 3 && (
            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={() => {
                router.push({
                  pathname: '/genre-see-all', 
                  params: { 
                    title: sectionTitle,
                    genre: genreGroup.genreName,
                    sectionId: sectionId
                  },
                });
              }}
            >
              <Text style={styles.seeAllText}>More</Text>
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

  const renderSection = (section: MovieSection) => {
    if (section.genreGroups.length === 0) return null;

    return (
      <View key={section.sectionId} style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.sectionTitle}</Text>
        </View>
        {section.genreGroups.map((genreGroup) =>
          renderGenreGroup(genreGroup, section.sectionId, section.sectionTitle)
        )}
      </View>
    );
  };

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
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Discover</Text>
            <Text style={styles.headerSubtitle}>
              {searchQuery.trim()
                ? `${filteredMovies.length} result${filteredMovies.length === 1 ? '' : 's'}`
                : `${sections.length} sections`}
            </Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/hotspot')}>
              <Ionicons name="wifi" size={22} color="#10B981" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/account')}>
              <Ionicons name="person-circle-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={navigateToDownloads} style={styles.iconButton}>
              <Ionicons name="download-outline" size={22} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={22} color="#FF4D6D" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search movies, genres, videos"
            placeholderTextColor="#6B7280"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearSearchButton}
              onPress={clearSearch}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color="#FF4D6D" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {sections.map(section => renderSection(section))}

        {sections.length === 0 && !isLoading && !error && (
          <View style={styles.emptyContainer}>
            <Ionicons name={searchQuery.trim() ? 'search-outline' : 'film-outline'} size={64} color="#6B7280" />
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? 'No matching contents found' : 'No movies found'}
            </Text>
            {searchQuery.trim() ? (
              <TouchableOpacity style={styles.retryButton} onPress={clearSearch}>
                <Text style={styles.retryButtonText}>Clear Search</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
                <Text style={styles.retryButtonText}>Refresh</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  loadingText: { marginTop: 16, fontSize: 16, color: '#9CA3AF' },
  header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 32, fontWeight: 'bold', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 14, color: '#9CA3AF', marginTop: 4 },
  headerButtons: { flexDirection: 'row', gap: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255, 77, 109, 0.3)' },
  searchContainer: { marginHorizontal: 16, marginBottom: 18, minHeight: 48, borderRadius: 12, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: 'rgba(255, 77, 109, 0.25)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  searchInput: { flex: 1, minHeight: 46, fontSize: 15, color: '#FFFFFF', paddingVertical: 0 },
  clearSearchButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 77, 109, 0.1)', padding: 12, borderRadius: 12, marginHorizontal: 16, marginBottom: 16, gap: 8 },
  errorText: { flex: 1, fontSize: 13, color: '#FF4D6D' },
  section: { marginBottom: 28 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 77, 109, 0.2)' },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#FF4D6D', letterSpacing: 1, textTransform: 'uppercase' },
  genreGroup: { marginBottom: 16 },
  genreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
  genreTitle: { fontSize: 15, fontWeight: '600', color: '#E5E7EB', letterSpacing: 0.3 },
  seeAllText: { fontSize: 13, color: '#FF4D6D', fontWeight: '600' },
  horizontalList: { paddingHorizontal: 16, gap: 12 },
  movieCard: { width: 130, backgroundColor: '#1C1C1E', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 77, 109, 0.15)' },
  posterContainer: { width: '100%', aspectRatio: 2 / 3, position: 'relative' },
  poster: { width: '100%', height: '100%' },
  posterPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  ratingBadge: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.75)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, gap: 3 },
  ratingText: { fontSize: 10, fontWeight: 'bold', color: '#FFD700' },
  vipBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: '#FF4D6D', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  vipText: { fontSize: 9, fontWeight: 'bold', color: '#FFFFFF' },
  playButton: { position: 'absolute', bottom: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255, 77, 109, 0.9)', justifyContent: 'center', alignItems: 'center' },
  movieInfo: { padding: 10 },
  movieTitle: { fontSize: 12, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  movieDuration: { fontSize: 11, color: '#9CA3AF' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: '#6B7280', marginTop: 16, marginBottom: 24 },
  retryButton: { backgroundColor: '#FF4D6D', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryButtonText: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' },
  bottomPadding: { height: 40 }
});
