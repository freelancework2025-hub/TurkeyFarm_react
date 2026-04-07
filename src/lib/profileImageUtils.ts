import { api } from "@/lib/api";

/**
 * Utility functions for profile image operations with automatic cache invalidation
 */

let profileImageCacheInvalidator: ((userKey: string | number) => void) | null = null;

/**
 * Register the cache invalidator function (called by ProfileImageProvider)
 */
export function registerProfileImageCacheInvalidator(invalidator: (userKey: string | number) => void) {
  profileImageCacheInvalidator = invalidator;
}

/**
 * Normalize user key to ensure consistency across the app
 */
export function normalizeUserKey(userKey: string | number | { id: number; email?: string }): string | number {
  if (typeof userKey === 'object' && userKey !== null) {
    // For user objects, prefer email if available, otherwise use id
    return userKey.email?.trim() || userKey.id;
  }
  return userKey as string | number;
}

/**
 * Upload profile image with automatic cache invalidation
 */
export async function uploadProfileImageWithCache(
  userKey: string | number | { id: number; email?: string }, 
  file: File, 
  token?: string | null
) {
  const normalizedKey = normalizeUserKey(userKey);
  
  const result = await api.users.uploadProfileImage(normalizedKey, file, token);
  
  // Invalidate cache for this user using all possible key variations
  if (profileImageCacheInvalidator) {
    profileImageCacheInvalidator(normalizedKey);
    
    // If we have a user object, also invalidate both email and ID variants
    if (typeof userKey === 'object' && userKey !== null) {
      if (userKey.email?.trim()) {
        profileImageCacheInvalidator(userKey.email.trim());
      }
      profileImageCacheInvalidator(userKey.id);
    }
  }
  
  return result;
}

/**
 * Delete profile image with automatic cache invalidation
 */
export async function deleteProfileImageWithCache(
  userKey: string | number | { id: number; email?: string }, 
  token?: string | null
) {
  const normalizedKey = normalizeUserKey(userKey);
  await api.users.deleteProfileImage(normalizedKey, token);
  
  // Invalidate cache for this user
  if (profileImageCacheInvalidator) {
    profileImageCacheInvalidator(normalizedKey);
  }
}