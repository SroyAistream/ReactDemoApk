import { apiClient } from '../../../../core/network/api_client';
import { API_ENDPOINTS } from '../../../../core/constants/api_constants';
import { AuthResponse } from '../../domain/entities/user';
import AsyncStorage from '@react-native-async-storage/async-storage';

export class AuthRemoteDataSource {
  async guestLogin(deviceInfo: any): Promise<AuthResponse> {
    try {
      // Build query parameters matching the exact API format
      const params = new URLSearchParams({
        identity: deviceInfo.identity,
        password: deviceInfo.password,
        unique_id: deviceInfo.unique_id,
        player_type: deviceInfo.player_type,
        device: deviceInfo.device,
        manufacturer: deviceInfo.manufacturer,
        model: deviceInfo.model,
        os: deviceInfo.os,
        os_version: deviceInfo.os_version,
        app: deviceInfo.app,
        app_version: deviceInfo.app_version,
      });

      console.log('Guest login API call with params:', params.toString());

      const response = await apiClient.get<any>(
        `${API_ENDPOINTS.GUEST_LOGIN}?${params.toString()}`
      );

      console.log('Raw API response:', JSON.stringify(response, null, 2));
      
      // Save the full raw response to AsyncStorage for debugging
      await AsyncStorage.setItem('login_response', JSON.stringify(response));
      console.log('Saved login response to AsyncStorage');

      // Handle real API response format: {status: {...}, data: {...}}
      if (response.status && response.data) {
        // Real demo.aistream.tv API format
        console.log('API Status Code:', response.status.code);
        console.log('API Status Message:', response.status.message);
        
        // Check if status code is 0 (success)
        if (response.status.code !== 0) {
          throw new Error(response.status.message || 'Login failed');
        }

        // Extract token from data object
        const token = response.data.token;
        const userId = response.data.user_id;
        
        console.log('Extracted token:', token?.substring(0, 50) + '...');
        console.log('Extracted user_id:', userId);

        // Transform to expected format
        return {
          user_id: userId,
          password: response.data.password || '',
          token: token,
          token_expiry_times: new Date(response.data.token_expiry_time).toISOString(),
          plan: {
            name: response.data.plan_name || 'Free Plan',
            expiry: new Date(response.data.token_expiry_time).toISOString(),
          },
        };
      }

      // Fallback for mock API format
      console.log('Using fallback format');
      return response as AuthResponse;
    } catch (error: any) {
      console.error('Guest login API error:', error);
      console.error('Error details:', error.response?.data);
      throw error;
    }
  }
}

export const authRemoteDataSource = new AuthRemoteDataSource();
