
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import ImageGrid from '@/components/home/ImageGrid';
import type { UserImage } from '@/components/home/ImageGrid';
import UploadFAB from '@/components/home/UploadFAB';
import AiFAB from '@/components/home/AiFAB';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { FileText } from 'lucide-react';

function HomePageContent() {
  const [images, setImages] = useState<UserImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { user, userId } = useAuth();
  const { toast } = useToast();

  const triggerRefresh = useCallback(() => {
    console.log("HomePageContent: Triggering refresh by incrementing refreshKey.");
    setRefreshKey(prevKey => prevKey + 1);
  }, []);

  const fetchImages = useCallback(async () => {
    if (!userId || !user) {
      setIsLoading(false);
      setImages([]);
      console.log("HomePageContent: fetchImages skipped, no userId or user object.");
      return;
    }

    console.log(`HomePageContent: Starting fetchImages for userId: ${userId}, refreshKey: ${refreshKey}`);
    setIsLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      if (!idToken) {
        console.error("HomePageContent: Failed to get ID token. User might not be fully authenticated or token refresh failed.");
        throw new Error("Authentication token not available. Please ensure you are logged in or try logging in again.");
      }

      const fetchUrl = `/api/user-images?userId=${userId}`;
      console.log(`HomePageContent: Fetching from URL: ${fetchUrl} with Authorization header.`);
      const response = await fetch(fetchUrl, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });

      const responseText = await response.text(); // Get raw text first for logging
      if (!response.ok) {
        let errorData = { message: `Error ${response.status}: Failed to load certificates from API.`, detail: `Status code ${response.status}`, errorKey: 'UNKNOWN_CLIENT_ERROR' };
        let errorPayloadForConsole: any = { rawResponse: responseText.substring(0, 500) };
        try {
          errorPayloadForConsole = JSON.parse(responseText);
          if (typeof errorPayloadForConsole === 'object' && errorPayloadForConsole !== null) {
            errorData.message = errorPayloadForConsole.message || errorData.message;
            errorData.detail = errorPayloadForConsole.detail || errorData.detail;
            errorData.errorKey = errorPayloadForConsole.errorKey || errorData.errorKey;
          }
        } catch (jsonError) {
          console.error("HomePageContent: Could not parse error JSON from API. Raw response text used for error message. JSON parsing error:", jsonError);
          errorData.message = responseText.substring(0,200).trim() || errorData.message;
          if (!responseText.trim() && response.status === 401) {
             errorData.message = "Unauthorized: Access denied. Please check your login status.";
          }
        }
        const displayErrorMessage = errorData.message || `Failed to load certificates. Server responded with status ${response.status}.`;
        console.error(`HomePageContent: API error while fetching certificates. Status: ${response.status}. Parsed/Raw error payload for console:`, errorPayloadForConsole);
        throw new Error(`API Error: ${displayErrorMessage}`);
      }

      const data: UserImage[] = JSON.parse(responseText); // Parse from text after ensuring response is ok
      console.log("HomePageContent: Successfully fetched certificate data from API. Count:", data.length);
      console.log("HomePageContent: Raw data from API (first 5 images stringified):", JSON.stringify(data.slice(0,5), null, 2));
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
  }, [userId, user, toast, refreshKey]);

  useEffect(() => {
    console.log("HomePageContent: useEffect triggered for fetchImages. Current userId:", userId, "Current refreshKey:", refreshKey);
    if (userId && user) {
        fetchImages();
    } else {
        setIsLoading(false);
        setImages([]);
    }
  }, [userId, user, fetchImages, refreshKey]);

  return (
    <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8">
      <div className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-center md:text-left">
            <h1 className="text-3xl md:text-4xl font-bold font-headline mb-2">Your Certificate Hub</h1>
            <p className="text-muted-foreground text-lg">Browse, upload, and manage your certificates.</p>
        </div>
      </div>
      <ImageGrid
        images={images}
        isLoading={isLoading}
        error={error}
        onImageDeleted={triggerRefresh}
        currentUserId={userId}
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
