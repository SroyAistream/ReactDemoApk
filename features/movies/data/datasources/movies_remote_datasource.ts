import { apiClient } from '../../../../core/network/api_client';
import { API_ENDPOINTS, STORAGE_KEYS } from '../../../../core/constants/api_constants';
import { MovieResponse } from '../../domain/entities/movie';
import { storageHelper } from '../../../../core/utils/storage_helper';

/**
 * Builds the Authentication header using stored Bearer token.
 * Uses the 'Authentication' header key (not 'Authorization') as required by AiStream API.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await storageHelper.getItem(STORAGE_KEYS.TOKEN);
  if (token) {
    return { Authentication: `Bearer ${token}` };
  }
  return {};
}

/**
 * Extracts the movies array from the AiStream API response.
 *
 * Response shapes handled:
 *  Real API:  { status: {code, message}, data: [ ...movies ] }
 *  Mock API:  { status: {code, message}, data: { content: [ ...movies ] } }
 *  Direct:    [ ...movies ]
 */
function extractMovies(response: any): MovieResponse[] {
  // Real / Mock API wrapper: { status, data }
  if (response?.status !== undefined && response?.data !== undefined) {
    if (response.status.code !== 0) {
      throw new Error(response.status.message || 'API returned error status');
    }

    const data = response.data;

    if (Array.isArray(data)) {
      // Real AiStream API: data IS the movies list
      console.log(`Extracted ${data.length} movies from real API (data as array)`);
      return data;
    }

    if (typeof data === 'object' && data !== null) {
      const movies = data.content ?? data.movies ?? [];
      console.log(`Extracted ${movies.length} movies from mock API (data.content/movies)`);
      return movies;
    }

    return [];
  }

  // Mock format: { movies: [...] }
  if (response?.movies) {
    return response.movies;
  }

  // Direct array
  if (Array.isArray(response)) {
    return response;
  }

  return [];
}

export class MoviesRemoteDataSource {
  /**
   * Fetches all movies.  Requires Authentication header with stored Bearer token.
   */
  async getMovies(): Promise<MovieResponse[]> {
    try {
      const headers = await getAuthHeaders();
      console.log('Fetching movies with Authentication header:', !!headers.Authentication);

      const response = await apiClient.get<any>(API_ENDPOINTS.GET_MOVIES, { headers });
      return extractMovies(response);
    } catch (error) {
      console.error('Get movies API error:', error);
      throw error;
    }
  }

  async getHotMovies(): Promise<MovieResponse[]> {
    try {
      const headers = await getAuthHeaders();
      const response = await apiClient.get<any>(API_ENDPOINTS.GET_HOT_MOVIES, { headers });
      return extractMovies(response);
    } catch (error) {
      console.error('Get hot movies API error:', error);
      throw error;
    }
  }

  async getRecommendations(): Promise<MovieResponse[]> {
    try {
      const headers = await getAuthHeaders();
      const response = await apiClient.get<any>(API_ENDPOINTS.GET_RECOMMENDATIONS, { headers });
      return extractMovies(response);
    } catch (error) {
      console.error('Get recommendations API error:', error);
      throw error;
    }
  }
}

export const moviesRemoteDataSource = new MoviesRemoteDataSource();
