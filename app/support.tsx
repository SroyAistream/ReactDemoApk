import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// App version
const APP_VERSION = '1.0.0';

// Contact methods
interface ContactMethod {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const CONTACT_METHODS: ContactMethod[] = [
  { id: 'whatsapp', name: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366' },
  { id: 'viber', name: 'Viber', icon: 'chatbubble-ellipses', color: '#7360F2' },
  { id: 'wechat', name: 'WeChat', icon: 'chatbubbles', color: '#07C160' },
  { id: 'messenger', name: 'Messenger', icon: 'chatbubble', color: '#0084FF' },
];

// Device info interface
interface DeviceInfo {
  deviceName: string;
  osVersion: string;
  deviceId: string;
  appVersion: string;
}

// Connection info interface
interface ConnectionInfo {
  wifiSSID: string;
  wifiFrequency: string;
  wifiSignalStrength: string;
}

export default function TechnicalSupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    deviceName: 'Loading...',
    osVersion: 'Loading...',
    deviceId: 'Loading...',
    appVersion: APP_VERSION,
  });
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    wifiSSID: 'N/A',
    wifiFrequency: 'N/A',
    wifiSignalStrength: 'N/A',
  });
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    loadDeviceInfo();
  }, []);

  const loadDeviceInfo = async () => {
    try {
      // Get or generate device ID
      let deviceId = await AsyncStorage.getItem('aistream_device_id');
      if (!deviceId) {
        deviceId = `AISTREAM_${Date.now()}_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        await AsyncStorage.setItem('aistream_device_id', deviceId);
      }

      // Get device info
      const deviceName = Device.modelName || Device.deviceName || Platform.OS;
      const osVersion = `${Platform.OS} ${Device.osVersion || Platform.Version}`;

      setDeviceInfo({
        deviceName: deviceName,
        osVersion: osVersion,
        deviceId: deviceId,
        appVersion: APP_VERSION,
      });

      // Connection info - WiFi details not easily accessible in Expo
      // Show N/A for now
      setConnectionInfo({
        wifiSSID: 'N/A',
        wifiFrequency: 'N/A',
        wifiSignalStrength: 'N/A',
      });
    } catch (error) {
      console.error('Error loading device info:', error);
    }
  };

  const handleContactPress = (method: ContactMethod) => {
    // For now, icons do nothing on click
    console.log(`Contact method pressed: ${method.name}`);
  };

  const handleResetApp = () => {
    Alert.alert(
      'Reset App',
      'This will clear all local data, cached movies, and reset the app to its initial state. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: performReset },
      ]
    );
  };

  const performReset = async () => {
    setIsResetting(true);
    try {
      // Clear all AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      await AsyncStorage.multiRemove(allKeys);
      console.log('AsyncStorage cleared');

      // Clear SQLite database (if using expo-sqlite)
      // Note: For a full reset, we'll rely on the app restarting fresh
      // The database will be recreated on next launch

      // Navigate to splash screen
      router.replace('/');
    } catch (error) {
      console.error('Error resetting app:', error);
      Alert.alert('Error', 'Failed to reset app. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  // Render contact icon
  const renderContactIcon = (method: ContactMethod) => (
    <TouchableOpacity
      key={method.id}
      style={styles.contactIconContainer}
      onPress={() => handleContactPress(method)}
      activeOpacity={0.7}
    >
      <View style={[styles.contactIcon, { backgroundColor: method.color }]}>
        <Ionicons name={method.icon as any} size={28} color="#FFFFFF" />
      </View>
      <Text style={styles.contactLabel}>{method.name}</Text>
    </TouchableOpacity>
  );

  // Render info row
  const renderInfoRow = (label: string, value: string) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );

  return (
    <LinearGradient colors={['#12001F', '#000000']} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Technical Support</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* SECTION 1: How to contact us */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How to contact us</Text>
          <View style={styles.contactRow}>
            {CONTACT_METHODS.map(renderContactIcon)}
          </View>
        </View>

        {/* SECTION 2: Device Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device Info</Text>
          <View style={styles.card}>
            {renderInfoRow('Device Name', deviceInfo.deviceName)}
            {renderInfoRow('OS Version', deviceInfo.osVersion)}
            {renderInfoRow('Device ID', deviceInfo.deviceId)}
            {renderInfoRow('App Version', deviceInfo.appVersion)}
          </View>
        </View>

        {/* SECTION 3: Connection Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection Info</Text>
          <View style={styles.card}>
            {renderInfoRow('WiFi SSID Name', connectionInfo.wifiSSID)}
            {renderInfoRow('WiFi Frequency', connectionInfo.wifiFrequency)}
            {renderInfoRow('WiFi Signal Strength', connectionInfo.wifiSignalStrength)}
          </View>
        </View>

        {/* SECTION 4: Reset App */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleResetApp}
            activeOpacity={0.7}
            disabled={isResetting}
          >
            <Ionicons name="refresh-circle" size={24} color="#FF4D6D" />
            <Text style={styles.resetButtonText}>
              {isResetting ? 'Resetting...' : 'Reset App'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.resetHint}>
            Clears all local data and cached content
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSpacer: {
    width: 44,
  },

  // Sections
  section: {
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Contact Icons
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
  },
  contactIconContainer: {
    alignItems: 'center',
  },
  contactIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  contactLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },

  // Card
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },

  // Info Row
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  infoLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },

  // Reset Button
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 109, 0.3)',
    backgroundColor: 'rgba(255, 77, 109, 0.1)',
    gap: 10,
  },
  resetButtonText: {
    fontSize: 16,
    color: '#FF4D6D',
    fontWeight: '600',
  },
  resetHint: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 10,
  },
});
