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
      const rows = movies.map((movie) => ({
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
        genres:            movie.genres?.map((g) => g.name) ?? [],
        genres_json:       JSON.stringify(movie.genres ?? []),
        
        // FIX: Stringify the entire quality list so SQLite can store it safely
        quality_list_json: JSON.stringify(movie.quality_list ?? []),
        
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
        // Force string extraction or safe parsing fallback
        const rawGenresJson = typeof row.genres_json === 'string' 
          ? row.genres_json 
          : JSON.stringify(row.genres_json ?? []);

        const parsed = JSON.parse(rawGenresJson);
        
        if (Array.isArray(parsed)) {
          genres = parsed.map((g: any) => {
            if (!g) return { id: 0, name: 'Uncategorized' };
            // IMMUNIZATION AGAINST MINIFICATION:
            // Look for hardcoded fallback keys if the minifier altered property schemas
            const nameValue = g.name || g.name_col || (typeof g === 'string' ? g : '');
            const idValue = typeof g.id === 'number' ? g.id : 0;
            return { id: idValue, name: String(nameValue || 'Uncategorized') };
          });
        }
      } catch (genreError) {
        console.error('[MoviesLocal] Minified genre extraction crash, using fallback string split:', genreError);
        // Fallback string extraction loop if native layer array objects break
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

      return {
        movie_id:           Number(row.movie_id),
        name:               String(row.name || ''),
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
        quality_list:       Array.isArray(qualityList) ? qualityList : [],
        directors:          Array.isArray(row.directors) ? row.directors.map((n: any) => ({ name: typeof n === 'string' ? n : String(n?.name || '') })) : [],
        actors:             Array.isArray(row.actors) ? row.actors.map((n: any) => ({ name: typeof n === 'string' ? n : String(n?.name || '') })) : [],
      };
    });
  }
  // mapToResponse(rows: any[]): MovieResponse[] {
  //   return rows.map((row) => {
  //     let genres: Array<{ id: number; name: string }> = [];
  //     try {
  //       const parsed = typeof row.genres_json === 'string'
  //         ? JSON.parse(row.genres_json)
  //         : (row.genres_json ?? []);
  //       genres = Array.isArray(parsed)
  //         ? parsed.map((g: any) => typeof g === 'string' ? { id: 0, name: g } : g)
  //         : [];
  //     } catch {
  //       genres = (row.genres ?? []).map((n: string) => ({ id: 0, name: n }));
  //     }

  //     let videoType: { id: number; name: string } | null = null;
  //     try {
  //       if (row.video_type && row.video_type !== '{}') {
  //         videoType = typeof row.video_type === 'object'
  //           ? row.video_type
  //           : JSON.parse(row.video_type);
  //       }
  //     } catch { videoType = null; }

  //     // FIX: Safely parse the quality_list back into an array from the JSON string
  //     let qualityList: any[] = [];
  //     try {
  //       if (row.quality_list_json) {
  //         qualityList = typeof row.quality_list_json === 'string'
  //           ? JSON.parse(row.quality_list_json)
  //           : row.quality_list_json;
  //       }
  //     } catch (e) {
  //       console.warn(`[MoviesLocal] Failed to parse quality_list for movie ${row.name}`);
  //       qualityList = [];
  //     }

  //     return {
  //       movie_id:           Number(row.movie_id),
  //       name:               row.name,
  //       synopsis:           row.synopsis,
  //       poster:             row.poster_url,
  //       poster_url:         row.poster_url,
  //       theatrical_poster:  row.theatrical_poster,
  //       preview:            row.preview,
  //       preview_url:        row.preview_url,
  //       duration:           row.duration,
  //       publish_date:       row.publish_date,
  //       release_date:       row.release_date,
  //       country:            row.country,
  //       star_score:         String(row.star_score ?? ''),
  //       rating:             row.rating,
  //       type:               row.type ? Number(row.type) : undefined,
  //       content_type:       row.content_type ?? 0,
  //       video_type:         videoType,
        
  //       // FIX: Attach the restored array to the response
  //       quality_list:       qualityList,
        
  //       directors:          (row.directors ?? []).map((n: string) => ({ name: n })),
  //       actors:             (row.actors  ?? []).map((n: string) => ({ name: n })),
  //     };
  //   });
  // }
}

export const moviesLocalDataSource = new MoviesLocalDataSource();