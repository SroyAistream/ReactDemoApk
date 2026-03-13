// User Entity
export interface User {
  userId: string;
  password: string;
  token: string;
  tokenExpiry: string;
  deviceId: string;
  planName?: string;
  planExpiry?: string;
}

// Auth Response from API
export interface AuthResponse {
  user_id: string;
  password: string;
  token: string;
  token_expiry_times: string;
  plan?: {
    name: string;
    expiry: string;
  };
}
