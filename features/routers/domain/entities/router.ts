/**
 * Router Entity (domain model)
 *
 * Represents an AiStream Media Hub.
 */

export interface RouterConfig {
  is_update_movie_online?: number;
  download_servers?: string[];
  is_reverse_proxy?: number;
  name?: string;
  ssid?: string;
  ssid_5g?: string;
  max_session_allow?: number;
  max_download_speed?: number;
  work_mode?: number;
}

export interface Router {
  id: number;
  uuid?: string;
  name: string;
  /** 2.4 GHz BSSID — e.g. "F8:5E:3C:3F:D7:72" */
  mac?: string;
  /** 5 GHz BSSID — e.g. "F8:5E:3C:3F:D7:73" */
  mac_5g?: string;
  /** 2.4 GHz SSID */
  ssid?: string;
  /** 5 GHz SSID */
  ssid5g?: string;
  city?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  /** Distance in km from API */
  distance?: number;
  /** Calculated Haversine distance in km */
  calculatedDistance?: number;
  status?: number;
  hotspot_id?: string;
  local_ip?: string;
  public_ip?: string;
  config?: RouterConfig;
}

/**
 * Router API Response — matches /fag/routers response shape
 */
export interface RouterResponse {
  id: number;
  uuid?: string;
  name: string;
  mac?: string;
  mac_5g?: string;
  ssid?: string;
  ssid5g?: string;
  city?: string;
  region?: string;
  country?: string;
  latitude?: number | string;
  longitude?: number | string;
  distance?: number | string;
  status?: number;
  hotspot_id?: string;
  local_ip?: string;
  public_ip?: string;
  config?: RouterConfig;
}
