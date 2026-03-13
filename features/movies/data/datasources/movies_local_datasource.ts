import { databaseHelper } from '../../../../core/database/database_helper';
import { MovieResponse } from '../../domain/entities/movie';

const POSTER_BASE_URL = 'https://demo.aistream.tv:8833/';

function buildFullPosterUrl(movie: MovieResponse): string {
  if (movie.poster_url && movie.poster_url.startsWith('http')) return movie.poster_url;
  const rel = movie.poster ?? movie.theatrical_poster ?? movie.preview ?? '';
  if (!rel) return '';
  const base = POSTER_BASE_URL.endsWith('/') ? POSTER_BASE_URL : POSTER_BASE_URL + '/';
  const path = rel.startsWith('/') ? rel.slice(1) : rel;
  return base + path;
}

export class MoviesLocalDataSource {
  async saveMovies(movies: MovieResponse[]): Promise<void> {
    try {
      const rows = movies.map((movie) => ({
        movie_id:          String(movie.movie_id),
        name:              movie.name,
        synopsis:          movie.synopsis ?? '',
        rating:            movie.rating ?? 0,
        poster_url:        buildFullPosterUrl(movie),
        preview_url:       movie.preview_url ?? '',
        theatrical_poster: movie.theatrical_poster ?? '',
        preview:           movie.preview ?? '',
        duration:          movie.duration ?? 0,
        publish_date:      movie.publish_date ?? '',
        release_date:      movie.release_date ?? '',
        country:           movie.country ?? '',
        star_score:        parseFloat(movie.star_score ?? String(movie.rating ?? 0)) || 0,
        type:              String(movie.type ?? ''),
        content_type:      movie.content_type ?? 0,
        video_type:        movie.video_type ? JSON.stringify(movie.video_type) : '{}',
        genres:            movie.genres?.map((g) => g.name) ?? [],
        genres_json:       JSON.stringify(movie.genres ?? []),
        directors:         movie.directors?.map((d) => d.name) ?? [],
        actors:            movie.actors?.map((a) => a.name) ?? [],
      }));
      await databaseHelper.saveMovies(rows);
    } catch (error) {
      console.error('[MoviesLocal] saveMovies error:', error);
      throw error;
    }
  }

  async getMovies(limit = 200, offset = 0): Promise<any[]> {
    try {
      return await databaseHelper.getMovies(limit, offset);
    } catch (error) {
      console.error('[MoviesLocal] getMovies error:', error);
      return [];
    }
  }

  async searchMovies(query: string): Promise<any[]> {
    try {
      return await databaseHelper.searchMovies(query);
    } catch (error) {
      console.error('[MoviesLocal] searchMovies error:', error);
      return [];
    }
  }

  async getMoviesCount(): Promise<number> {
    try {
      return await databaseHelper.getMoviesCount();
    } catch {
      return 0;
    }
  }

  async clearMovies(): Promise<void> {
    try {
      await databaseHelper.clearMovies();
    } catch (error) {
      console.error('[MoviesLocal] clearMovies error:', error);
    }
  }

  /**
   * Maps DB rows back to MovieResponse — preserves all fields needed
   * by home.tsx categorization (content_type, video_type, genres with id+name).
   */
  mapToResponse(rows: any[]): MovieResponse[] {
    return rows.map((row) => {
      let genres: Array<{ id: number; name: string }> = [];
      try {
        const parsed = typeof row.genres_json === 'string'
          ? JSON.parse(row.genres_json)
          : (row.genres_json ?? []);
        genres = Array.isArray(parsed)
          ? parsed.map((g: any) => typeof g === 'string' ? { id: 0, name: g } : g)
          : [];
      } catch {
        genres = (row.genres ?? []).map((n: string) => ({ id: 0, name: n }));
      }

      let videoType: { id: number; name: string } | null = null;
      try {
        if (row.video_type && row.video_type !== '{}') {
          videoType = typeof row.video_type === 'object'
            ? row.video_type
            : JSON.parse(row.video_type);
        }
      } catch { videoType = null; }

      return {
        movie_id:           Number(row.movie_id),
        name:               row.name,
        synopsis:           row.synopsis,
        poster:             row.poster_url,
        poster_url:         row.poster_url,
        theatrical_poster:  row.theatrical_poster,
        preview:            row.preview,
        preview_url:        row.preview_url,
        duration:           row.duration,
        publish_date:       row.publish_date,
        release_date:       row.release_date,
        country:            row.country,
        star_score:         String(row.star_score ?? ''),
        rating:             row.rating,
        type:               row.type ? Number(row.type) : undefined,
        content_type:       row.content_type ?? 0,
        video_type:         videoType,
        genres,
        directors:          (row.directors ?? []).map((n: string) => ({ name: n })),
        actors:             (row.actors  ?? []).map((n: string) => ({ name: n })),
      };
    });
  }
}

export const moviesLocalDataSource = new MoviesLocalDataSource();
