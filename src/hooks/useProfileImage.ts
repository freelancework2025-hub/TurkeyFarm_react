import { useState, useEffect } from "react";
import { getApiBase, getStoredToken } from "@/lib/api";
import { useProfileImageCache } from "@/contexts/ProfileImageContext";

/**
 * Fetches the profile image for a user (with auth) and returns a blob URL for use in img src.
 * Revokes the blob URL on unmount or when userId/refreshKey changes.
 * Uses global profile image cache for synchronization across components.
 * @param userKey - numeric user id or email (path segment is URL-encoded)
 * @param localRefreshKey - optional local refresh key (for backward compatibility)
 */
export function useProfileImage(userKey: string | number | null, localRefreshKey = 0): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const { getRefreshKey } = useProfileImageCache();

  // Combine global and local refresh keys
  const globalRefreshKey = userKey ? getRefreshKey(userKey) : 0;
  const effectiveRefreshKey = globalRefreshKey + localRefreshKey;

  useEffect(() => {
    if (userKey === null || userKey === undefined || userKey === "") {
      setBlobUrl(null);
      return;
    }
    
    const token = getStoredToken();
    const segment = encodeURIComponent(String(userKey));
    const url = `${getApiBase()}/api/users/${segment}/profile-image`;
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    let objectUrl: string | null = null;
    fetch(url, { headers, credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) {
            // Image not found - this is normal for users without images
            return null;
          }
          console.error('Profile image fetch failed for user:', userKey, 'status:', res.status);
          return null;
        }
        return res.blob();
      })
      .then((blob) => {
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
        }
        setBlobUrl(objectUrl);
      })
      .catch((err) => {
        console.error('Profile image fetch error for user:', userKey, err);
        setBlobUrl(null);
      });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userKey, effectiveRefreshKey]);

  return blobUrl;
}
