import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../core/constants/api_constants';
import { useProfileStore } from '../features/profile/presentation/providers/profile_provider';

// Profile cache key
const PROFILE_CACHE_KEY = 'cached_profile';

// Menu item interface
interface MenuItem {
  id: string;
  icon: string;
  title: string;
  value?: string;
  valueColor?: string;
  showChevron: boolean;
}

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Use the offline-first profile store
  const { profile, isLoading, fetchProfile, clearProfile } = useProfileStore();

  // Load profile data on screen mount
  useEffect(() => {
    fetchProfile();
  }, []);

  // Build menu items using profile data
  const getMenuItems = (): MenuItem[] => {
    return [
      {
        id: 'favorites',
        icon: 'heart',
        title: 'Favorite Movies',
        showChevron: true,
      },
      {
        id: 'balance',
        icon: 'wallet',
        title: 'Account Balance',
        // Use balance from API response
        value: profile?.balance !== undefined ? `$${profile.balance.toFixed(2)}` : '$0.00',
        valueColor: '#10B981', // Green
        showChevron: true,
      },
      {
        id: 'topup',
        icon: 'add-circle',
        title: 'Top Up Account',
        showChevron: true,
      },
      {
        id: 'subscription',
        icon: 'card',
        title: 'Subscription Plan',
        // Use plan_name from API response
        value: profile?.plan_name || 'Free Plan',
        showChevron: true,
      },
      {
        id: 'credits',
        icon: 'download',
        title: 'Free Movie Credits',
        // Use available_downloads from API response
        value: profile?.available_downloads !== undefined 
          ? `${profile.available_downloads} available` 
          : '0 available',
        showChevron: true,
      },
      {
        id: 'history',
        icon: 'receipt',
        title: 'Purchase History',
        showChevron: true,
      },
      {
        id: 'support',
        icon: 'headset',
        title: 'Technical Support',
        showChevron: true,
      },
    ];
  };

  const handleMenuPress = (itemId: string) => {
    console.log('Menu item pressed:', itemId);
    
    switch (itemId) {
      case 'support':
        router.push('/support');
        break;
      default:
        break;
    }
  };

  const handleLogout = async () => {
    // Clear all auth and profile data
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.TOKEN,
      STORAGE_KEYS.USER_ID,
      STORAGE_KEYS.PASSWORD,
      STORAGE_KEYS.IS_LOGGED_IN,
      STORAGE_KEYS.TOKEN_EXPIRY,
      PROFILE_CACHE_KEY,
    ]);
    // Clear profile from store
    clearProfile();
    router.replace('/');
  };

  const handleRefresh = () => {
    fetchProfile(true); // forceRefresh
  };

  // Render menu item
  const renderMenuItem = (item: MenuItem) => (
    <TouchableOpacity
      key={item.id}
      style={styles.menuItem}
      onPress={() => handleMenuPress(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.menuItemLeft}>
        <View style={styles.menuIconContainer}>
          <Ionicons name={item.icon as any} size={22} color="#FF4D6D" />
        </View>
        <Text style={styles.menuItemTitle}>{item.title}</Text>
      </View>
      <View style={styles.menuItemRight}>
        {item.value && (
          <Text style={[styles.menuItemValue, item.valueColor && { color: item.valueColor }]}>
            {item.value}
          </Text>
        )}
        {item.showChevron && (
          <Ionicons name="chevron-forward" size={20} color="#6B7280" />
        )}
      </View>
    </TouchableOpacity>
  );

  // Loading state
  if (isLoading) {
    return (
      <LinearGradient colors={['#12001F', '#000000']} style={styles.container}>
        <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color="#FF4D6D" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </LinearGradient>
    );
  }

  // Get display values from profile
  const displayName = profile?.name || 'Guest User';
  const accountId = profile?.account_id || profile?.user_id || 'N/A';

  return (
    <LinearGradient colors={['#12001F', '#000000']} style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {/* Header with Back Button */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account</Text>
          <TouchableOpacity 
            style={styles.refreshButton} 
            onPress={handleRefresh}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={22} color="#10B981" />
          </TouchableOpacity>
        </View>

        {/* Profile Header Section */}
        <View style={styles.profileSection}>
          {/* Profile Icon */}
          <View style={styles.profileIconContainer}>
            <LinearGradient
              colors={['#FF4D6D', '#E63946']}
              style={styles.profileIconGradient}
            >
              <Ionicons name="person" size={48} color="#FFFFFF" />
            </LinearGradient>
          </View>

          {/* User Name */}
          <Text style={styles.userName}>{displayName}</Text>

          {/* Account ID */}
          <Text style={styles.accountId}>
            Account ID: {accountId}
          </Text>
        </View>

        {/* Menu List */}
        <View style={styles.menuSection}>
          {getMenuItems().map(renderMenuItem)}
        </View>

        {/* Logout Button */}
        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={22} color="#FF4D6D" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#9CA3AF',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
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
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 77, 109, 0.15)',
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#FF4D6D',
  },

  // Profile Section
  profileSection: {
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  profileIconContainer: {
    marginBottom: 16,
  },
  profileIconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  accountId: {
    fontSize: 14,
    color: '#9CA3AF',
  },

  // Menu Section
  menuSection: {
    paddingHorizontal: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 77, 109, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuItemValue: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '600',
  },

  // Logout Button
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 109, 0.3)',
    backgroundColor: 'rgba(255, 77, 109, 0.1)',
    gap: 10,
  },
  logoutText: {
    fontSize: 16,
    color: '#FF4D6D',
    fontWeight: '600',
  },
});
