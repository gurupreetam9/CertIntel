
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import ImageGrid from '@/components/home/ImageGrid';
import type { UserImage } from '@/components/home/ImageGrid';
import UploadFAB from '@/components/home/UploadFAB';
import AiFAB from '@/components/home/AiFAB';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Crop, Minimize, FileText } from 'lucide-react';

export type ImageFitMode = 'contain' | 'cover';

function HomePageContent() {
  const [images, setImages] = useState<UserImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { userId } = useAuth();
  const { toast } = useToast();
  // Ensure the default image fit mode is 'contain' to match the screenshot style
  const [imageFitMode, setImageFitMode] = useState<ImageFitMode>('contain'); 

  const toggleImageFitMode = () => {
    setImageFitMode(prevMode => (prevMode === 'contain' ? 'cover' : 'contain'));
  };

  const triggerRefresh = useCallback(() => {
    console.log("HomePageContent: Triggering refresh by incrementing refreshKey.");
    setRefreshKey(prevKey => prevKey + 1);
  }, []);

  const fetchImages = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      setImages([]);
      console.log("HomePageContent: fetchImages skipped, no userId.");
      return;
    }

    console.log(`HomePageContent: Starting fetchImages for userId: ${userId}, refreshKey: ${refreshKey}`);
    setIsLoading(true);
    setError(null);
    try {
      const fetchUrl = `/api/user-images?userId=${userId}`;
      const response = await fetch(fetchUrl);

      if (!response.ok) {
        let errorData = { message: `Error ${response.status}: Failed to load certificates from API.`, detail: `Status code ${response.status}`, errorKey: 'UNKNOWN_CLIENT_ERROR' };
        try {
          const parsedJson = await response.json();
          if (parsedJson && typeof parsedJson === 'object') {
            errorData.message = parsedJson.message || errorData.message;
            errorData.detail = parsedJson.detail || errorData.detail;
            errorData.errorKey = parsedJson.errorKey || errorData.errorKey;
          }
        } catch (jsonError) {
          console.error("HomePageContent: Could not parse error JSON from API. Raw response text might follow if parsable.", jsonError);
          try {
            const rawText = await response.text(); 
            console.error("HomePageContent: Raw error response text from API:", rawText.substring(0, 500));
          } catch (textReadError) {
            console.error("HomePageContent: Could not read raw error response text from API.", textReadError);
          }
        }
        const displayErrorMessage = errorData.message || `Failed to load certificates. Server responded with status ${response.status}.`;
        console.error(`HomePageContent: API error while fetching certificates. Status: ${response.status}. Full errorData from API:`, errorData);
        throw new Error(`API Error: ${displayErrorMessage}`);
      }
      const data: UserImage[] = await response.json();
      console.log("HomePageContent: Successfully fetched certificate data. Count:", data.length);
      setImages(data);
    } catch (err: any) {
      console.error("HomePageContent: Error in fetchImages catch block:", err);
      const errorMessage = err.message || "Could not load your certificates due to an unexpected error.";
      setError(errorMessage);
      toast({
        title: "Error Loading Certificates",
        description: errorMessage,
        variant: "destructive",
      });
      setImages([]);
    } finally {
      console.log("HomePageContent: fetchImages finished. Setting isLoading to false.");
      setIsLoading(false);
    }
  }, [userId, toast, refreshKey]);

  useEffect(() => {
    console.log("HomePageContent: useEffect triggered for fetchImages. Current userId:", userId, "Current refreshKey:", refreshKey);
    if (userId) {
        fetchImages();
    } else {
        setIsLoading(false);
        setImages([]);
    }
  }, [userId, fetchImages, refreshKey]);

  return (
    <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8">
      <div className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-center md:text-left">
            <h1 className="text-3xl md:text-4xl font-bold font-headline mb-2">Your Certificate Hub</h1>
            <p className="text-muted-foreground text-lg">Browse, upload, and manage your certificates.</p>
        </div>
        <Button onClick={toggleImageFitMode} variant="outline" size="sm" className="shrink-0">
          {imageFitMode === 'contain' ? <Minimize className="mr-2 h-4 w-4" /> : <Crop className="mr-2 h-4 w-4" /> }
          {/* Text reflects the action: if current is 'contain', offer to switch to 'cover' */}
          {imageFitMode === 'contain' ? 'Switch to Cover' : 'Switch to Contain'}
        </Button>
      </div>
      <ImageGrid
        images={images}
        isLoading={isLoading}
        error={error}
        onImageDeleted={triggerRefresh}
        currentUserId={userId}
        imageFitMode={imageFitMode}
      />
      <UploadFAB onUploadSuccess={triggerRefresh} />
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
