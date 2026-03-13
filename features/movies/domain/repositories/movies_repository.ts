import { MovieResponse } from '../entities/movie';

export interface MoviesRepository {
  getMovies(forceRefresh?: boolean): Promise<MovieResponse[]>;
  getHotMovies(): Promise<MovieResponse[]>;
  getRecommendations(): Promise<MovieResponse[]>;
  searchMovies(query: string): Promise<MovieResponse[]>;
}
