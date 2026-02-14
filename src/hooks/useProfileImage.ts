import { useState, useEffect } from "react";
import { getApiBase, getStoredToken } from "@/lib/api";

/**
 * Fetches the profile image for a user (with auth) and returns a blob URL for use in img src.
 * Revokes the blob URL on unmount or when userId/refreshKey changes.
 * @param refreshKey - increment to force refetch (e.g. after upload)
 */
export function useProfileImage(userId: number | null, refreshKey = 0): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setBlobUrl(null);
      return;
    }
    const token = getStoredToken();
    const url = `${getApiBase()}/api/users/${userId}/profile-image`;
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    let objectUrl: string | null = null;
    fetch(url, { headers, credentials: "include" })
      .then((res) => {
        if (!res.ok) return null;
        return res.blob();
      })
      .then((blob) => {
        if (blob) objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => setBlobUrl(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, refreshKey]);

  return blobUrl;
}
