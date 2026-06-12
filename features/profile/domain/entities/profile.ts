/**
 * Profile Entity (domain model)
 *
 * Represents user account profile information.
 */

export interface Profile {
  user_id?: string;
  name?: string;
  surname?: string;
  user_name?: string;
  account?: string;
  account_id?: string;
  balance?: number;
  plan_name?: string;
  available_downloads?: number;
  max_downloads?: number;
  enc_accounting?: string;
  email?: string;
  phone?: string;
}

/**
 * Profile API Response — matches /fag/account/profile response shape
 */
export interface ProfileResponse {
  user_id?: string;
  name?: string;
  surname?: string;
  user_name?: string;
  account?: string;
  account_id?: string;
  balance?: number | string;
  plan_name?: string;
  available_downloads?: number | string;
  max_downloads?: number | string;
  enc_accounting?: string;
  email?: string;
  phone?: string;
}
