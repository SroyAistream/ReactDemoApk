/**
 * useHubDetection.ts
 * 
 * Simple gateway-based Media Hub detection.
 * Hub is connected if gateway IP == 192.168.39.20
 * 
 * Zero network calls - instant detection.
 */

import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

// Hub gateway IP
const HUB_GATEWAY_IP = '192.168.39.20';

export interface HubDetectionState {
  deviceIp: string | null;
  gatewayIp: string | null;
  isHubConnected: boolean;
  isLoading: boolean;
  lastChecked: Date | null;
}

/**
 * Derive gateway IP from device IP.
 * Assumes gateway is at .1 or .20 in the same subnet.
 * For 192.168.39.* network, gateway is 192.168.39.20 (the hub).
 */
function deriveGatewayIp(deviceIp: string | null): string | null {
  if (!deviceIp) return null;
  
  const parts = deviceIp.split('.');
  if (parts.length !== 4) return null;
  
  const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
  
  // For the hub network (192.168.39.*), gateway is the hub itself
  if (subnet === '192.168.39') {
    return HUB_GATEWAY_IP;
  }
  
  // For other networks, assume gateway is .1
  return `${subnet}.1`;
}

export function useHubDetection() {
  const [state, setState] = useState<HubDetectionState>({
    deviceIp: null,
    gatewayIp: null,
    isHubConnected: false,
    isLoading: true,
    lastChecked: null,
  });

  /**
   * Perform hub detection
   */
  const detectHub = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      // 1) Get device IP
      const deviceIp = await Network.getIpAddressAsync();
      console.log('[HubDetection] Device IP:', deviceIp);
      
      // 2) Derive gateway IP from device IP
      const gatewayIp = deriveGatewayIp(deviceIp);
      console.log('[HubDetection] Gateway IP:', gatewayIp);
      
      // 3) Check if gateway matches hub
      const isHubConnected = gatewayIp === HUB_GATEWAY_IP;
      console.log('[HubDetection] Hub connected:', isHubConnected);
      
      setState({
        deviceIp,
        gatewayIp,
        isHubConnected,
        isLoading: false,
        lastChecked: new Date(),
      });
    } catch (error) {
      console.error('[HubDetection] Error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        lastChecked: new Date(),
      }));
    }
  }, []);

  // Run detection on mount
  useEffect(() => {
    detectHub();
  }, [detectHub]);

  // Network change listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState: NetInfoState) => {
      console.log('[HubDetection] Network changed:', netState.type, netState.isConnected);
      if (netState.isConnected) {
        detectHub();
      } else {
        setState(prev => ({
          ...prev,
          deviceIp: null,
          gatewayIp: null,
          isHubConnected: false,
          lastChecked: new Date(),
        }));
      }
    });

    return () => unsubscribe();
  }, [detectHub]);

  // App foreground listener
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('[HubDetection] App foregrounded, re-detecting...');
        detectHub();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [detectHub]);

  return {
    ...state,
    detectHub,
    HUB_GATEWAY_IP,
  };
}
