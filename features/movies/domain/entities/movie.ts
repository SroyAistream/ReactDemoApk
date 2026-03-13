// Movie Entity (domain model)
export interface Movie {
  movieId: number;
  name: string;
  synopsis?: string;
  poster?: string;           // real API field: poster path (relative URL)
  theatricalPoster?: string; // real API field: theatrical_poster path
  posterUrl?: string;        // legacy / mock field
  previewUrl?: string;
  duration?: number;         // in seconds (real API)
  publishDate?: string;
  releaseDate?: string;
  country?: string;
  starScore?: string;        // real API returns string e.g. "8.5"
  rating?: number;           // mock data numeric rating
  type?: number;             // 1 = free, 2 = VIP
  vip?: number;              // 1 = VIP content
  genres: GenreItem[];
  directors?: Array<{ name: string }>;
  actors?: Array<{ name: string }>;
}

// Genre item with id (matches real API)
export interface GenreItem {
  id: number;
  name: string;
}

/**
 * CDN domain entry from resource_domains array.
 * Java: resource_domains[0].cdnaddress1 + movie.poster = full poster URL
 */
export interface ResourceDomain {
  providerid?: number;
  cdnaddress1: string;   // primary CDN base URL (e.g. "http://52.66.33.89:4433/")
  cdnaddress2?: string;  // secondary CDN base URL
  priority?: number;
  loadsharing?: string;
}

// Movie API Response – matches real demo.aistream.tv /fag/movies response
export interface MovieResponse {
  movie_id: number;
  name: string;
  synopsis?: string;
  // Real API poster fields (relative paths):
  poster?: string;            // relative poster path
  theatrical_poster?: string; // alternate poster path
  preview?: string;           // preview image path
  // Mock data field (full URL already):
  poster_url?: string;
  preview_url?: string;
  duration?: number;          // duration in SECONDS (real API)
  publish_date?: string;
  release_date?: string;
  country?: string;
  star_score?: string;        // real API: string (e.g. "8.5" or "")
  rating?: number;            // mock data: numeric rating
  type?: number;              // 1 = free, 2 = VIP
  vip?: number;               // 1 = VIP content
  genres?: GenreItem[];       // includes id + name
  directors?: Array<{ name: string }>;
  actors?: Array<{ name: string }>;
  /**
   * Categorization fields (Android HomeAdapter logic)
   * content_type: 1 = Movie, 4 = Short Video
   * video_type: {id: 1-4, name} for short-video sub-category
   */
  content_type?: number;
  video_type?: { id: number; name: string } | null;
  /**
   * CDN domains for this content.
   * Java: resource_domains[0].cdnaddress1 + poster = full poster URL
   */
  resource_domains?: ResourceDomain[];
}

// Movie Section for UI display
export interface MovieSection {
  genreId: number;
  genreName: string;
  movies: MovieResponse[];
}
