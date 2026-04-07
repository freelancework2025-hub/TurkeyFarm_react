# Profile Image Synchronization System

## Overview

This system provides **global, synchronous profile image management** across all pages in the application. When a user updates their profile image anywhere in the app, all other components displaying that user's image will update **immediately and automatically**.

## Key Features

✅ **Database-Centric Storage**: Images stored as BYTEA in PostgreSQL  
✅ **Global Cache Management**: Centralized refresh state across all components  
✅ **Automatic Synchronization**: Updates propagate instantly to all pages  
✅ **Consistent User Keys**: Unified user identification strategy  
✅ **Memory Efficient**: Proper blob URL cleanup prevents memory leaks  
✅ **Error Handling**: Comprehensive error messages and loading states  
✅ **Backward Compatible**: Existing code continues to work  

## Architecture

### Core Components

1. **ProfileImageContext** (`/contexts/ProfileImageContext.tsx`)
   - Global state management for refresh keys
   - Cache invalidation methods
   - Automatic registration with utility functions

2. **useProfileImage Hook** (`/hooks/useProfileImage.ts`)
   - Enhanced with global cache integration
   - Combines global and local refresh keys
   - Maintains backward compatibility

3. **Profile Image Utilities** (`/lib/profileImageUtils.ts`)
   - `uploadProfileImageWithCache()` - Upload with auto-invalidation
   - `deleteProfileImageWithCache()` - Delete with auto-invalidation
   - `normalizeUserKey()` - Consistent user identification

4. **UserAvatar Component** (`/components/UserAvatar.tsx`)
   - Uses consistent user key strategy
   - Supports both user objects and simple IDs
   - Integrates with global cache system

## Usage

### Basic Setup

The system is already integrated into the main App component:

```tsx
// App.tsx
<AuthProvider>
  <ProfileImageProvider>
    {/* Your app routes */}
  </ProfileImageProvider>
</AuthProvider>
```

### Displaying Profile Images

Use the `UserAvatar` component with consistent user data:

```tsx
// For user objects (preferred)
<UserAvatar 
  userId={user.id} 
  hasProfileImage={user.hasProfileImage} 
  size="lg" 
  user={{ id: user.id, email: user.email }} 
/>

// For simple user IDs (fallback)
<UserAvatar 
  userId={userId} 
  hasProfileImage={hasProfileImage} 
  size="sm" 
/>
```

### Uploading Profile Images

Use the cache-aware utility functions:

```tsx
import { uploadProfileImageWithCache } from '@/lib/profileImageUtils';

// Upload with automatic cache invalidation
try {
  await uploadProfileImageWithCache(user, file);
  toast({ title: "Photo mise à jour" });
} catch (error) {
  toast({ title: error.message, variant: "destructive" });
}
```

### Deleting Profile Images

```tsx
import { deleteProfileImageWithCache } from '@/lib/profileImageUtils';

// Delete with automatic cache invalidation
try {
  await deleteProfileImageWithCache(user);
  toast({ title: "Photo supprimée" });
} catch (error) {
  toast({ title: "Erreur lors de la suppression", variant: "destructive" });
}
```

## User Key Strategy

The system uses a **consistent user identification strategy**:

1. **Preferred**: User's email address (if available)
2. **Fallback**: User's numeric ID

This ensures that the same user is identified consistently across all components, regardless of how the user data is passed.

```tsx
// The normalizeUserKey function handles this automatically
const userKey = normalizeUserKey(user); // Returns email or ID
```

## How Synchronization Works

1. **Upload/Delete**: User performs image operation using utility functions
2. **Cache Invalidation**: Utility automatically calls global cache invalidator
3. **Global Refresh**: All components using that user's image refresh immediately
4. **Blob Management**: New blob URLs created, old ones cleaned up automatically
5. **UI Update**: All pages show updated image synchronously

## File Size Limits

The system supports images up to **5MB** with the following formats:
- JPEG
- PNG  
- GIF
- WEBP

## Error Handling

The system provides comprehensive error handling:

- **File too large**: Clear message with size limit
- **Invalid format**: Specific format requirements
- **Network errors**: Graceful fallback with retry options
- **Authentication errors**: Proper error messages

## Testing

Use the provided test utilities to verify synchronization:

```tsx
import { testProfileImageSync, createTestImageFile } from '@/lib/profileImageTestUtils';

// Test upload synchronization
const testFile = createTestImageFile();
await testProfileImageSync(user, testFile);

// Test deletion synchronization  
await testProfileImageDelete(user);
```

## Troubleshooting

### Images Not Updating Across Pages

1. **Check ProfileImageProvider**: Ensure it's wrapped around your app
2. **Verify User Keys**: Make sure consistent user identification is used
3. **Check Console**: Look for cache invalidation logs
4. **Test Utilities**: Use test functions to verify setup

### Memory Leaks

The system automatically manages blob URLs, but if you notice memory issues:

1. **Check Cleanup**: Verify blob URLs are being revoked
2. **Component Unmounting**: Ensure proper cleanup in useEffect
3. **Browser DevTools**: Monitor memory usage in Performance tab

### Performance Issues

1. **Image Size**: Keep images under 1MB for best performance
2. **Caching**: The system uses efficient blob URL caching
3. **Network**: Consider image compression for slower connections

## Migration from Old System

If migrating from the old manual refresh key system:

1. **Remove Local State**: Delete local `refreshKey` state variables
2. **Update Upload Calls**: Replace `api.users.uploadProfileImage()` with `uploadProfileImageWithCache()`
3. **Update Delete Calls**: Replace `api.users.deleteProfileImage()` with `deleteProfileImageWithCache()`
4. **Update UserAvatar**: Pass user objects instead of just IDs when possible

## Best Practices

1. **Always use utility functions** for upload/delete operations
2. **Pass complete user objects** to UserAvatar when available
3. **Handle errors gracefully** with user-friendly messages
4. **Test synchronization** after making changes to the system
5. **Monitor performance** with large images or many users

## Security Considerations

- Images are stored in the database (not file system)
- JWT authentication required for all operations
- File type validation prevents malicious uploads
- Size limits prevent DoS attacks
- Proper error handling prevents information leakage

## Future Enhancements

Potential improvements to consider:

- Image compression/resizing on upload
- CDN integration for better performance  
- Progressive image loading
- Image cropping interface
- Bulk image operations
- Image versioning/history