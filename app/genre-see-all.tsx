import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMoviesStore } from '../features/movies/presentation/providers/movies_provider';
import { MovieResponse } from '../features/movies/domain/entities/movie';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
// Calculate dynamic item width based on 3 columns with margins
const CARD_WIDTH = (width - (16 * 2) - (12 * (COLUMN_COUNT - 1))) / COLUMN_COUNT;
const POSTER_BASE_URL = 'https://demo.aistream.tv:8833/';
const PLACEHOLDER_BLURHASH = 'L02}lN0000%g0000WB9Z9Zt79F-p';

export default function GenreSeeAllScreen() {
  const router = useRouter();
  
  // 1. Grab navigation parameters passed from HomeScreen
  const { title, genre, sectionId } = useLocalSearchParams<{
    title: string;
    genre: string;
    sectionId: string;
  }>();

  // 2. Extract current reactive movie pool from Zustand store
  const { movies } = useMoviesStore();

  // 3. Filter and isolate the extensive movie list for this specific category
  const filteredMovies = useMemo(() => {
    const sId = Number(sectionId);

    // Filter logic mimicking HomeScreen's content_type routing definitions
    let subset = movies;
    if (sId === -1 || sId === -2 || sId === -3) {
      // Filter for Full-length movies (content_type == 1)
      subset = movies.filter((m) => m.content_type === 1);
    } else if (sId >= -7 && sId <= -4) {
      // Filter for Short videos (content_type == 4)
      subset = movies.filter((m) => m.content_type === 4);
    }

    // Narrow down by matching the target genre group name
    return subset.filter((movie) => {
      const genres = movie.genres ?? [];
      if (genres.length === 0) {
        return genre === 'Uncategorized';
      }
      return genres.some((g) => (g.name || 'Uncategorized') === genre);
    });
  }, [movies, genre, sectionId]);

  // 4. Poster URL Builder matching exact Java/HomeScreen pattern
  const getPosterUrl = (movie: MovieResponse): string | null => {
    if (movie.poster_url && movie.poster_url.startsWith('http')) {
      return movie.poster_url;
    }
    const relativePath = movie.poster ?? movie.theatrical_poster ?? movie.preview ?? null;
    if (!relativePath) return null;

    const base = POSTER_BASE_URL.endsWith('/') ? POSTER_BASE_URL : POSTER_BASE_URL + '/';
    const path = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    return base + path;
  };

  // 5. Render individual item grid block
  const renderGridItem = ({ item }: { item: MovieResponse }) => {
    const posterUrl = getPosterUrl(item);
    const score = parseFloat(item.star_score ?? String(item.rating ?? 0)) || 0;

    return (
      <TouchableOpacity
        style={styles.movieCard}
        activeOpacity={0.8}
        onPress={() => {
          // Navigates directly to your movie detail view with the movie stringified
          router.push({
            pathname: '/movie-detail',
            params: { movie: JSON.stringify(item) },
          });
        }}
      >
        <View style={styles.posterContainer}>
          {posterUrl ? (
            <Image
              source={{ uri: posterUrl }}
              style={styles.poster}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={250}
              placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
            />
          ) : (
            <View style={styles.posterPlaceholder}>
              <Ionicons name="film-outline" size={24} color="#FF4D6D" />
            </View>
          )}

          {score > 0 && (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={9} color="#FFD700" />
              <Text style={styles.ratingText}>{score.toFixed(1)}</Text>
            </View>
          )}

          {/* Direct Stream Quick-Action Overlay Button */}
          <TouchableOpacity 
            style={styles.quickPlayButton}
            activeOpacity={0.7}
            onPress={(e) => {
              e.stopPropagation(); // Stop navigation click bubble on parent card
              // Bypasses details screen, deep linking configuration directly to playback engine
              router.push({
                pathname: '/player',
                params: { movie: JSON.stringify(item) },
              });
            }}
          >
            <Ionicons name="play" size={12} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.movieTitle} numberOfLines={2}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={['#12001F', '#000000']} style={styles.container}>
      {/* Structural Navigation Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{genre}</Text>
        </View>
      </View>

      {/* Infinite Vertical Grid */}
      <FlatList
        data={filteredMovies}
        keyExtractor={(item, index) => `${item.movie_id}-${index}`}
        renderItem={renderGridItem}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={styles.gridContent}
        columnWrapperStyle={styles.gridRowGap}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="film-outline" size={48} color="#6B7280" />
            <Text style={styles.emptyText}>No contents inside this category</Text>
          </View>
        }
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 77, 109, 0.15)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#FF4D6D',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 2,
  },
  gridContent: {
    padding: 16,
    paddingBottom: 40,
  },
  gridRowGap: {
    justifyContent: 'flex-start',
    gap: 12, // Space between columns horizontally
  },
  movieCard: {
    width: CARD_WIDTH,
    marginBottom: 16,
  },
  posterContainer: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 109, 0.1)',
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
    top: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 2,
  },
  ratingText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  quickPlayButton: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 77, 109, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  movieTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 12,
  },
});