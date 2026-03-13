/**
 * RandomKeyManager.ts
 * 
 * Manages the randomkey received from get_download_right API.
 * 
 * Randomkey rules (from Android):
 * - Binds to APP IP + movie_id
 * - Expires after 10 minutes
 * - Must revalidate when:
 *   - Reconnecting to router
 *   - New movie selected
 *   - Key expired
 */

import { storageHelper } from '../utils/storage_helper';

const RANDOM_KEY_STORAGE = 'random_key_data';
const KEY_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface RandomKeyData {
  key: string;
  movieId: string | number;
  timestamp: number;
}

class RandomKeyManagerClass {
  private currentKey: RandomKeyData | null = null;

  /**
   * Store a new randomkey for a movie
   */
  async setKey(movieId: string | number, key: string): Promise<void> {
    const data: RandomKeyData = {
      key,
      movieId,
      timestamp: Date.now(),
    };
    
    this.currentKey = data;
    
    try {
      await storageHelper.setItem(RANDOM_KEY_STORAGE, JSON.stringify(data));
      console.log('[RandomKeyManager] Key stored for movie:', movieId);
      console.log('[RandomKeyManager] Key value:', key);
    } catch (error) {
      console.error('[RandomKeyManager] Failed to persist key:', error);
    }
  }

  /**
   * Get randomkey for a movie (if valid and not expired)
   */
  async getKey(movieId: string | number): Promise<string | null> {
    // First check in-memory cache
    if (this.currentKey) {
      if (this.isKeyValid(this.currentKey, movieId)) {
        console.log('[RandomKeyManager] Using cached key');
        return this.currentKey.key;
      }
    }

    // Try to load from storage
    try {
      const stored = await storageHelper.getItem(RANDOM_KEY_STORAGE);
      if (stored) {
        const data: RandomKeyData = JSON.parse(stored);
        if (this.isKeyValid(data, movieId)) {
          this.currentKey = data;
          console.log('[RandomKeyManager] Using stored key');
          return data.key;
        }
      }
    } catch (error) {
      console.error('[RandomKeyManager] Failed to load key:', error);
    }

    console.log('[RandomKeyManager] No valid key found');
    return null;
  }

  /**
   * Check if a key is still valid
   */
  private isKeyValid(data: RandomKeyData, movieId: string | number): boolean {
    // Check movie ID match
    if (String(data.movieId) !== String(movieId)) {
      console.log('[RandomKeyManager] Key invalid: movie ID mismatch');
      return false;
    }

    // Check expiry (10 minutes)
    const age = Date.now() - data.timestamp;
    if (age > KEY_EXPIRY_MS) {
      console.log('[RandomKeyManager] Key invalid: expired');
      return false;
    }

    return true;
  }

  /**
   * Invalidate current key (on network reconnect or error)
   */
  async invalidate(): Promise<void> {
    console.log('[RandomKeyManager] Invalidating key');
    this.currentKey = null;
    try {
      await storageHelper.removeItem(RANDOM_KEY_STORAGE);
    } catch (error) {
      console.error('[RandomKeyManager] Failed to remove key:', error);
    }
  }

  /**
   * Get current key regardless of movie ID (for debugging)
   */
  getCurrentKey(): string | null {
    return this.currentKey?.key || null;
  }

  /**
   * Format key for Cookie header
   */
  formatCookie(key: string): string {
    // The key comes as "randomkey=xxxxx" from Set-Cookie
    // For Cookie header, we just need the full value
    if (key.startsWith('randomkey=')) {
      return key;
    }
    return `randomkey=${key}`;
  }
}

export const RandomKeyManager = new RandomKeyManagerClass();
