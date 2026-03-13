import { Platform } from 'react-native';

class DeviceHelper {
  async getDeviceId(): Promise<string> {
    // Hardcoded SOFLIX device ID
    return 'SOFLIX_37D5D77C668941608AA5D324EA29FBFC';
  }

  async getDeviceInfo() {
    // Hardcoded device information matching the API requirements
    console.log('Using hardcoded device info for SOFLIX');

    return {
      identity: 'SOFLIX_37D5D77C668941608AA5D324EA29FBFC',
      password: '',
      unique_id: 'SOFLIX_37D5D77C668941608AA5D324EA29FBFC',
      player_type: '2000',
      device: '2406ERN9CI',
      manufacturer: 'Xiaomi',
      model: '2406ERN9CI',
      os: 'android',
      os_version: '13',
      app: 'demo',
      app_version: '2.0.2',
    };
  }
}

export const deviceHelper = new DeviceHelper();
