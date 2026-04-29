export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed';

export interface DownloadItem {
  id?: number;
  movie_id: string;
  name: string;
  status: DownloadStatus;
  progress: number;        // 0 – 1
  local_path?: string | null;
  movie_json?: string | null;
  created_at?: string;
  updated_at?: string;
}
