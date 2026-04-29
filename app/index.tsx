import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Network from 'expo-network';
import { useAuthStore } from '../features/auth/presentation/providers/auth_provider';
import { databaseHelper } from '../core/database/database_helper';
import { useDownloadsStore } from '../features/downloads/presentation/providers/downloads_provider';

/** Quick hub detection: checks if device IP is in the 192.168.39.x subnet */
async function isHubReachable(): Promise<boolean> {
  try {
    const ip = await Network.getIpAddressAsync();
    if (!ip) return false;
    const parts = ip.split('.');
    return parts.length === 4 && `${parts[0]}.${parts[1]}.${parts[2]}` === '192.168.39';
  } catch {
    return false;
  }
}

export default function SplashScreen() {
  const router = useRouter();
  const { guestLogin, checkLogin, isLoading: authLoading } = useAuthStore();
  const { processPendingDownloads } = useDownloadsStore();

  // 'init'    – DB initializing + checking existing session
  // 'ready'   – show "Continue as Guest" button
  // 'logging' – guest login in progress
  const [phase, setPhase] = useState<'init' | 'ready' | 'logging'>('init');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      await databaseHelper.init();

      // Brief splash delay so branding is visible
      await new Promise(resolve => setTimeout(resolve, 1500));

      // If already logged in → go straight to home
      const loggedIn = await checkLogin();
      if (loggedIn) {
        // Fire-and-forget: process any pending downloads in background
        isHubReachable().then(hubConnected => {
          if (hubConnected) {
            console.log('[Splash] Hub connected – processing pending downloads');
            processPendingDownloads(true);
          }
        });
        router.replace('/home');
        return;
      }

      // Otherwise show the guest login button
      setPhase('ready');
    } catch (err) {
      console.error('Init error:', err);
      setPhase('ready'); // still show button on error
    }
  };

  const handleGuestLogin = async () => {
    setPhase('logging');
    setError(null);
    try {
      const success = await guestLogin();
      if (success) {
        // Also check downloads for freshly-logged-in session
        isHubReachable().then(hubConnected => {
          if (hubConnected) processPendingDownloads(true);
        });
        router.replace('/home');
      } else {
        setError('Login failed. Please try again.');
        setPhase('ready');
      }
    } catch (err: any) {
      setError(err?.message ?? 'An error occurred. Please try again.');
      setPhase('ready');
    }
  };

  const isInit    = phase === 'init';
  const isLogging = phase === 'logging';
  const isReady   = phase === 'ready';

  return (
    <LinearGradient
      colors={['#12001F', '#1a0030', '#000000']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      {/* ── Brand Section ──────────────────────────────────── */}
      <View style={styles.brandSection}>
        <View style={styles.logoWrapper}>
          <Image
            source={require('../assets/images/splash-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.brandText}>AiStream</Text>

        <View style={styles.taglineRow}>
          <View style={styles.accentLine} />
          <Text style={styles.tagline}>PREMIUM STREAMING EXPERIENCE</Text>
          <View style={styles.accentLine} />
        </View>
      </View>

      {/* ── Bottom Action Area ─────────────────────────────── */}
      <View style={styles.bottomSection}>

        {/* Initialising state */}
        {isInit && (
          <View style={styles.initRow}>
            <ActivityIndicator size="small" color="#FF4D6D" />
            <Text style={styles.initText}>Initializing...</Text>
          </View>
        )}

        {/* Guest login button */}
        {(isReady || isLogging) && (
          <>
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            <TouchableOpacity
              style={styles.guestButtonWrapper}
              onPress={handleGuestLogin}
              disabled={isLogging}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#FF4D6D', '#E63946']}
                style={styles.guestButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isLogging ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="play-circle" size={24} color="#FFFFFF" />
                    <Text style={styles.guestButtonText}>Continue as Guest</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.noRegText}>No registration required • Instant access</Text>
          </>
        )}
      </View>

      {/* ── Version ────────────────────────────────────────── */}
      <Text style={styles.version}>v1.0.0</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 80,
    paddingBottom: 48,
    paddingHorizontal: 24,
  },
  brandSection: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  logoWrapper: {
    padding: 20,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 77, 109, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255, 77, 109, 0.3)',
    marginBottom: 32,
  },
  logo: {
    width: 160,
    height: 160,
  },
  brandText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 3,
    marginBottom: 16,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accentLine: {
    width: 28,
    height: 2,
    backgroundColor: '#FF4D6D',
  },
  tagline: {
    fontSize: 11,
    color: '#9CA3AF',
    letterSpacing: 2.5,
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 8,
  },
  initRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  initText: {
    color: '#9CA3AF',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  errorText: {
    color: '#FF4D6D',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 4,
  },
  guestButtonWrapper: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#FF4D6D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  guestButton: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  guestButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  noRegText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  version: {
    fontSize: 11,
    color: '#4B5563',
  },
});
