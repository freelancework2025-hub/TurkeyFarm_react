import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { registerProfileImageCacheInvalidator } from '@/lib/profileImageUtils';

interface ProfileImageContextType {
  /** Get refresh key for a specific user */
  getRefreshKey: (userKey: string | number) => number;
  /** Invalidate profile image cache for a specific user */
  invalidateUser: (userKey: string | number) => void;
  /** Invalidate all profile image caches */
  invalidateAll: () => void;
  /** Force refresh all images (increments all keys by a large number) */
  forceRefreshAll: () => void;
}

const ProfileImageContext = createContext<ProfileImageContextType | null>(null);

export function ProfileImageProvider({ children }: { children: React.ReactNode }) {
  const [refreshKeys, setRefreshKeys] = useState<Map<string, number>>(new Map());

  const normalizeUserKey = useCallback((userKey: string | number): string => {
    return String(userKey).trim();
  }, []);

  const getRefreshKey = useCallback((userKey: string | number): number => {
    const key = normalizeUserKey(userKey);
    return refreshKeys.get(key) ?? 0;
  }, [refreshKeys, normalizeUserKey]);

  const invalidateUser = useCallback((userKey: string | number) => {
    const key = normalizeUserKey(userKey);
    setRefreshKeys(prev => {
      const newMap = new Map(prev);
      const oldValue = prev.get(key) ?? 0;
      const newValue = oldValue + 1;
      newMap.set(key, newValue);
      return newMap;
    });
  }, [normalizeUserKey]);

  const invalidateAll = useCallback(() => {
    setRefreshKeys(prev => {
      const newMap = new Map();
      for (const [key, value] of prev.entries()) {
        newMap.set(key, value + 1);
      }
      return newMap;
    });
  }, []);

  const forceRefreshAll = useCallback(() => {
    setRefreshKeys(prev => {
      const newMap = new Map();
      for (const [key, value] of prev.entries()) {
        newMap.set(key, value + 100); // Large increment to force refresh
      }
      return newMap;
    });
  }, []);

  // Register the cache invalidator for use by utility functions
  useEffect(() => {
    registerProfileImageCacheInvalidator(invalidateUser);
  }, [invalidateUser]);

  const value: ProfileImageContextType = {
    getRefreshKey,
    invalidateUser,
    invalidateAll,
    forceRefreshAll,
  };

  return (
    <ProfileImageContext.Provider value={value}>
      {children}
    </ProfileImageContext.Provider>
  );
}

export function useProfileImageCache(): ProfileImageContextType {
  const context = useContext(ProfileImageContext);
  if (!context) {
    throw new Error('useProfileImageCache must be used within a ProfileImageProvider');
  }
  return context;
}