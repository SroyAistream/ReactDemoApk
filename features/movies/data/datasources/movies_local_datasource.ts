import { databaseHelper } from '../../../../core/database/database_helper';
import { MovieResponse } from '../../domain/entities/movie';
import { useHubDetection } from '../../../../core/hooks/useHubDetection';
import { getBaseUrl } from '../../../../core/config/app_config';

function buildFullPosterUrl(movie: MovieResponse, isHubConnected: boolean): string {
  if (movie.poster_url && movie.poster_url.startsWith('http')) return movie.poster_url;
  const rel = movie.poster ?? movie.theatrical_poster ?? movie.preview ?? '';
  if (!rel) return '';
  const image_base_url = getBaseUrl(isHubConnected);
  const base = image_base_url.endsWith('/') ? image_base_url : image_base_url + '/';
  const path = rel.startsWith('/') ? rel.slice(1) : rel;
  return base + path;
}

function buildFullPreviewUrl(movie: MovieResponse, isHubConnected: boolean): string {
  if (movie.preview_url && movie.preview_url.startsWith('http')) return movie.preview_url;
  const rel = movie.preview ?? '';
  if (!rel) return '';
  const image_base_url = getBaseUrl(isHubConnected);
  const base = image_base_url.endsWith('/') ? image_base_url : image_base_url + '/';
  const path = rel.startsWith('/') ? rel.slice(1) : rel;
  return base + path;
}

export class MoviesLocalDataSource {
  async saveMovies(movies: MovieResponse[], isHubConnected: boolean): Promise<void> {
    try {
      // 🔍 DIAGNOSTIC LOG 1: Inspect raw API payload before saving to DB
      // if (movies.length > 0) {
      //   console.log('[DIAGNOSTIC 1] RAW API MOVIE SAMPLE FROM SYNC:', {
      //     name: movies[0].name,
      //     has_genres: !!movies[0].genres,
      //     genres_raw: JSON.stringify(movies[0].genres),
      //     isHubConnected
      //   });
      // }

      const rows = movies.map((movie) => {
        const genresArray = movie.genres ?? [];
        
        return {
          movie_id:          String(movie.movie_id),
          name:              movie.name,
          synopsis:          movie.synopsis ?? '',
          rating:            movie.rating ?? 0,
          poster_url:        buildFullPosterUrl(movie, isHubConnected),
          preview_url:       buildFullPreviewUrl(movie, isHubConnected),
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
          genres:            genresArray.map((g) => g.name || ''),
          genres_json:       JSON.stringify(genresArray),
          quality_list_json: JSON.stringify(movie.quality_list ?? []),
          directors:         movie.directors?.map((d) => d.name) ?? [],
          actors:            movie.actors?.map((a) => a.name) ?? [],
        };
      });

      // 🔍 DIAGNOSTIC LOG 2: Check exactly what is being pushed down into SQLite
      // if (rows.length > 0) {
      //   console.log('[DIAGNOSTIC 2] TRANSFORMTED SQLITE ROW TO SAVE:', {
      //     name: rows[0].name,
      //     genres_json_string: rows[0].genres_json,
      //     genres_array_mapped: rows[0].genres
      //   });
      // }

      await databaseHelper.saveMovies(rows);
    } catch (error) {
      console.warn('[MoviesLocal] saveMovies skipped:', error);
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

  mapToResponse(rows: any[]): MovieResponse[] {
    // 🔍 DIAGNOSTIC LOG 3: Raw extraction look right out of the native DB layer
    // if (rows.length > 0) {
    //   console.log('[DIAGNOSTIC 3] RAW ROW DIRECT FROM SQLITE:', {
    //     name: rows[0].name,
    //     raw_genres_json_col: rows[0].genres_json,
    //     raw_genres_col: rows[0].genres
    //   });
    // }

    return rows.map((row) => {
      let genres: Array<{ id: number; name: string }> = [];
      
      try {
        const rawGenresJson = typeof row.genres_json === 'string' 
          ? row.genres_json 
          : JSON.stringify(row.genres_json ?? []);

        const parsed = JSON.parse(rawGenresJson);
        
        if (Array.isArray(parsed)) {
          genres = parsed.map((g: any) => {
            if (!g) return { id: 0, name: 'Uncategorized' };
            const nameValue = g.name || g.name_col || (typeof g === 'string' ? g : '');
            const idValue = typeof g.id === 'number' ? g.id : 0;
            return { id: idValue, name: String(nameValue || 'Uncategorized') };
          });
        }
      } catch (genreError) {
        const fallbackSource = typeof row.genres === 'string' ? row.genres.split(',') : (row.genres ?? []);
        genres = Array.isArray(fallbackSource)
          ? fallbackSource.map((n: any) => ({ id: 0, name: typeof n === 'string' ? n.trim() : String(n?.name || '') }))
          : [];
      }

      let videoType: { id: number; name: string } | null = null;
      try {
        if (row.video_type && row.video_type !== '{}') {
          const parsedVideo = typeof row.video_type === 'string'
            ? JSON.parse(row.video_type)
            : row.video_type;
          
          if (parsedVideo) {
            videoType = {
              id: Number(parsedVideo.id ?? 0),
              name: String(parsedVideo.name || '')
            };
          }
        }
      } catch { 
        videoType = null; 
      }

      let qualityList: any[] = [];
      try {
        if (row.quality_list_json) {
          qualityList = typeof row.quality_list_json === 'string'
            ? JSON.parse(row.quality_list_json)
            : row.quality_list_json;
        }
      } catch (e) {
        qualityList = [];
      }

      const mappedMovie = {
        movie_id:           Number(row.movie_id),
        name:               String(row.name || ''),
        synopsis:           row.synopsis,
        poster:             row.poster_url,
        poster_url:         row.poster_url,
        theatrical_poster:  row.theatrical_poster,
        preview:            row.preview,
        preview_url:        row.preview_url,
        duration:           row.duration ? Number(row.duration) : undefined,
        publish_date:       row.publish_date,
        release_date:       row.release_date,
        country:            row.country,
        star_score:         String(row.star_score ?? ''),
        rating:             row.rating ? Number(row.rating) : undefined,
        type:               row.type ? Number(row.type) : undefined,
        content_type:       row.content_type ? Number(row.content_type) : 0, 
        video_type:         videoType,
        quality_list:       Array.isArray(qualityList) ? qualityList : [],
        directors:          Array.isArray(row.directors) ? row.directors.map((n: any) => ({ name: typeof n === 'string' ? n : String(n?.name || '') })) : [],
        actors:             Array.isArray(row.actors) ? row.actors.map((n: any) => ({ name: typeof n === 'string' ? n : String(n?.name || '') })) : [],
        genres:             genres
      };

      return mappedMovie;
    });
  }
}

export const moviesLocalDataSource = new MoviesLocalDataSource();
