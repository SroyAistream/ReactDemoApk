/**
 * MediaHubDialog.tsx
 *
 * Dark premium modal that fires before any playback attempt.
 *
 * CASE A — Hub connected:
 *   Title:   "Media Hub Connected"
 *   Message: "Connected your phone to the AiStream Media Hub WiFi to play this content."
 *
 * CASE B — Hub not connected:
 *   Title:   "Media Hub Not Connected"
 *   Message: "Please connect your phone to the AiStream Media Hub WiFi to play this content."
 *   Primary:  "Open WiFi Settings" → opens device WiFi settings
 *   Secondary: "Cancel" → closes dialog
 *
 * Extra UX: Polls detectHub() every 8 s while dialog is open.
 *           Auto-closes immediately when hub reconnects.
 */
import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHubStore } from '../features/hub/presentation/providers/hub_provider';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function MediaHubDialog({ visible, onClose }: Props) {
  const { connectedHub, isHubConnected, isDetecting, detectHub } = useHubStore();
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track whether the dialog opened while NOT connected (Case B).
  // Auto-close only applies to that transition (disconnected → connected).
  const openedDisconnectedRef = useRef(false);

  const isConnected = isHubConnected || connectedHub !== null;

  // ── Entrance animation ────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      // Record connection state at dialog open time
      openedDisconnectedRef.current = !isConnected;
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 120,
        friction: 9,
      }).start();
    } else {
      scaleAnim.setValue(0.88);
      openedDisconnectedRef.current = false;
    }
  }, [visible]);

  // ── Auto-close when hub reconnects (Case B only) ──────────────────────────
  // Only closes if the dialog was opened while NOT connected and hub is NOW connected.
  useEffect(() => {
    if (visible && isConnected && openedDisconnectedRef.current) {
      onClose();
    }
  }, [isConnected, visible]);

  // ── Poll for reconnect while dialog is open ───────────────────────────────
  useEffect(() => {
    if (visible && !isConnected) {
      // Start polling
      pollRef.current = setInterval(() => {
        detectHub();
      }, 8000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [visible, isConnected]);

  // ── Open WiFi settings ────────────────────────────────────────────────────
  const openWifiSettings = async () => {
    try {
      if (Platform.OS === 'ios') {
        // iOS 16+: App-prefs:WIFI, older: prefs:root=WIFI
        const iosUrl = 'App-prefs:WIFI';
        const supported = await Linking.canOpenURL(iosUrl);
        await Linking.openURL(supported ? iosUrl : 'app-settings:');
      } else if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.WIFI_SETTINGS');
      } else {
        await Linking.openSettings();
      }
    } catch {
      // Fallback: generic settings page
      try { await Linking.openSettings(); } catch { /* ignore */ }
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Dimmed backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Dialog card */}
      <View style={styles.centeredView} pointerEvents="box-none">
        <Animated.View style={[styles.dialog, { transform: [{ scale: scaleAnim }] }]}>

          {/* Icon */}
          <View style={[styles.iconRing, isConnected ? styles.iconRingConnected : styles.iconRingDisconnected]}>
            {isDetecting ? (
              <ActivityIndicator size="small" color="#FF4D6D" />
            ) : isConnected ? (
              <Ionicons name="checkmark-circle" size={34} color="#10B981" />
            ) : (
              <Ionicons name="wifi-outline" size={34} color="#FF4D6D" />
            )}
          </View>

          {/* Title */}
          <Text style={[styles.title, isConnected ? styles.titleConnected : styles.titleDisconnected]}>
            {isConnected ? 'Media Hub Connected' : 'Media Hub Not Connected'}
          </Text>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Message */}
          <Text style={styles.message}>
            {isConnected
              ? 'Connected your phone to the AiStream Media Hub WiFi to play this content.'
              : 'Please connect your phone to the AiStream Media Hub WiFi to play this content.'}
          </Text>

          {/* Hub name when connected */}
          {isConnected && connectedHub?.name && (
            <View style={styles.hubChip}>
              <Ionicons name="wifi" size={13} color="#10B981" />
              <Text style={styles.hubChipText}>{connectedHub.name}</Text>
            </View>
          )}

          {/* Polling indicator (not connected + checking) */}
          {!isConnected && (
            <View style={styles.pollingRow}>
              <ActivityIndicator size="small" color="#6B7280" />
              <Text style={styles.pollingText}>Checking for hub connection...</Text>
            </View>
          )}

          {/* Buttons */}
          <View style={styles.buttonGroup}>
            {!isConnected && (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={openWifiSettings}
                activeOpacity={0.85}
                data-testid="open-wifi-settings-btn"
              >
                <Ionicons name="settings-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Open WiFi Settings</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.cancelButton, isConnected && styles.cancelButtonFull]}
              onPress={onClose}
              activeOpacity={0.8}
              data-testid="hub-dialog-cancel-btn"
            >
              <Text style={[styles.cancelText, isConnected && styles.cancelTextOk]}>
                {isConnected ? 'OK' : 'Cancel'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1A1A2E',
    borderRadius: 22,
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 32,
    elevation: 24,
  },

  // Icon
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  iconRingConnected: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  iconRingDisconnected: {
    backgroundColor: 'rgba(255, 77, 109, 0.12)',
    borderWidth: 2,
    borderColor: 'rgba(255, 77, 109, 0.3)',
  },

  // Title
  title: {
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  titleConnected: { color: '#6EE7B7' },
  titleDisconnected: { color: '#FFFFFF' },

  divider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    marginBottom: 16,
  },

  // Message
  message: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 14,
  },

  // Hub chip (connected state)
  hubChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  hubChipText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
  },

  // Polling row
  pollingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  pollingText: {
    fontSize: 12,
    color: '#6B7280',
  },

  // Buttons
  buttonGroup: {
    width: '100%',
    gap: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF4D6D',
    borderRadius: 14,
    paddingVertical: 14,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  cancelButtonFull: {
    backgroundColor: '#FF4D6D',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  cancelTextOk: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
