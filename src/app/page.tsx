
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import ImageGrid from '@/components/home/ImageGrid';
import type { UserImage } from '@/components/home/ImageGrid'; // Ensure UserImage is exported from ImageGrid or move to types
import UploadFAB from '@/components/home/UploadFAB';
import AiFAB from '@/components/home/AiFAB';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

function HomePageContent() {
  const [images, setImages] = useState<UserImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // Key to trigger refresh
  const { userId } = useAuth();
  const { toast } = useToast();

  const triggerRefresh = useCallback(() => {
    console.log("HomePageContent: Triggering refresh by incrementing refreshKey.");
    setRefreshKey(prevKey => prevKey + 1);
  }, []);

  const fetchImages = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      setImages([]);
      return;
    }

    console.log(`HomePageContent: Starting fetchImages for userId: ${userId}, refreshKey: ${refreshKey}`);
    setIsLoading(true);
    setError(null);
    try {
      const fetchUrl = `/api/user-images?userId=${userId}`;
      const response = await fetch(fetchUrl);

      if (!response.ok) {
        let errorData = { message: `Error ${response.status}: Failed to load images.` };
        try {
          errorData = await response.json();
        } catch (jsonError) {
          console.error("HomePageContent: Could not parse error JSON from server:", jsonError);
        }
        throw new Error(errorData.message || `Error ${response.status}: Failed to load images.`);
      }
      const data: UserImage[] = await response.json();
      console.log("HomePageContent: Successfully fetched image data. Count:", data.length);
      setImages(data);
    } catch (err: any) {
      console.error("HomePageContent: Error in fetchImages:", err);
      setError(err.message || "Could not load your images.");
      toast({
        title: "Error Loading Images",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
      setImages([]);
    } finally {
      console.log("HomePageContent: fetchImages finished. Setting isLoading to false.");
      setIsLoading(false);
    }
  }, [userId, toast, refreshKey]); // Added refreshKey to dependency array

  useEffect(() => {
    console.log("HomePageContent: useEffect triggered for fetchImages. Current userId:", userId, "Current refreshKey:", refreshKey);
    fetchImages();
  }, [userId, fetchImages, refreshKey]); // fetchImages itself is memoized with refreshKey, so this also implicitly depends on it.

  return (
    <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8">
      <div className="mb-8 text-center md:text-left">
        <h1 className="text-3xl md:text-4xl font-bold font-headline mb-2">Your Image Gallery</h1>
        <p className="text-muted-foreground text-lg">Browse, upload, and manage your images.</p>
      </div>
      <ImageGrid
        images={images}
        isLoading={isLoading}
        error={error}
        onImageDeleted={triggerRefresh} // Pass down the refresh trigger
        currentUserId={userId}
      />
      <UploadFAB onUploadSuccess={triggerRefresh} /> {/* Use triggerRefresh here */}
      <AiFAB />
    </div>
  );
}

export default function HomePage() {
  return (
    <ProtectedPage>
      <HomePageContent />
    </ProtectedPage>
  );
}
