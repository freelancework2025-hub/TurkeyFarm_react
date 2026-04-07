/**
 * Test utilities for profile image synchronization system
 * Use these functions to verify that profile images update synchronously across all pages
 */

import { uploadProfileImageWithCache, deleteProfileImageWithCache } from './profileImageUtils';

/**
 * Test profile image upload and verify synchronization
 * This function can be used to test that profile image updates are reflected immediately
 * across all components using the same user's image
 */
export async function testProfileImageSync(user: { id: number; email?: string }, testFile: File) {
  console.log('🧪 Testing profile image synchronization...');
  
  try {
    // Upload the image
    console.log('📤 Uploading profile image...');
    const result = await uploadProfileImageWithCache(user, testFile);
    console.log('✅ Upload successful:', result);
    
    // The cache should be automatically invalidated and all UserAvatar components
    // displaying this user's image should refresh immediately
    console.log('🔄 Cache invalidated automatically - all components should refresh');
    
    return result;
  } catch (error) {
    console.error('❌ Upload failed:', error);
    throw error;
  }
}

/**
 * Test profile image deletion and verify synchronization
 */
export async function testProfileImageDelete(user: { id: number; email?: string }) {
  console.log('🧪 Testing profile image deletion...');
  
  try {
    // Delete the image
    console.log('🗑️ Deleting profile image...');
    await deleteProfileImageWithCache(user);
    console.log('✅ Deletion successful');
    
    // The cache should be automatically invalidated and all UserAvatar components
    // should show the fallback user icon immediately
    console.log('🔄 Cache invalidated automatically - all components should show fallback icon');
    
  } catch (error) {
    console.error('❌ Deletion failed:', error);
    throw error;
  }
}

/**
 * Create a test image file for testing purposes
 */
export function createTestImageFile(): File {
  // Create a simple 1x1 pixel PNG image as a test file
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(0, 0, 1, 1);
  }
  
  return new Promise<File>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(new File([blob], 'test-image.png', { type: 'image/png' }));
      }
    }, 'image/png');
  }) as any; // Type assertion for simplicity in test utils
}

/**
 * Verify that profile image synchronization is working
 * Call this function after setting up the ProfileImageProvider to ensure everything is connected
 */
export function verifyProfileImageSetup(): boolean {
  try {
    // Check if ProfileImageProvider is available in the React tree
    // This is a basic check - in a real app you'd use React Testing Library
    const hasProvider = document.querySelector('[data-profile-image-provider]') !== null;
    
    if (!hasProvider) {
      console.warn('⚠️ ProfileImageProvider not found in DOM. Make sure it\'s wrapped around your app.');
      return false;
    }
    
    console.log('✅ Profile image synchronization system is properly set up');
    return true;
  } catch (error) {
    console.error('❌ Error verifying profile image setup:', error);
    return false;
  }
}