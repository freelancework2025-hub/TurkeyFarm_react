import { useState, useEffect } from "react";
import { getApiBase, getStoredToken } from "@/lib/api";

/**
 * Fetches the profile image for a user (with auth) and returns a blob URL for use in img src.
 * Revokes the blob URL on unmount or when userId/refreshKey changes.
 * @param refreshKey - increment to force refetch (e.g. after upload)
 * @param userKey - numeric user id or email (path segment is URL-encoded)
 */
export function useProfileImage(userKey: string | number | null, refreshKey = 0): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

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
  }, [userKey, refreshKey]);

  return blobUrl;
}
