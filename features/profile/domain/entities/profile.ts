/**
 * Profile Entity (domain model)
 *
 * Represents user account profile information.
 */

export interface Profile {
  user_id?: string;
  name?: string;
  account_id?: string;
  balance?: number;
  plan_name?: string;
  available_downloads?: number;
  email?: string;
  phone?: string;
}

/**
 * Profile API Response — matches /fag/account/profile response shape
 */
export interface ProfileResponse {
  user_id?: string;
  name?: string;
  account_id?: string;
  balance?: number | string;
  plan_name?: string;
  available_downloads?: number;
  email?: string;
  phone?: string;
}
