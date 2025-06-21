
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import ImageGrid from '@/components/home/ImageGrid';
import type { UserImage } from '@/components/home/ImageGrid';
import UploadFAB from '@/components/home/UploadFAB';
import AiFAB from '@/components/home/AiFAB';
import SearchWithSuggestions from '@/components/common/SearchWithSuggestions';
import type { SearchableItem } from '@/components/common/SearchWithSuggestions';
import { useEffect, useState, useCallback, useMemo } from 'react';
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
  const [searchTerm, setSearchTerm] = useState('');

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

      const responseText = await response.text(); 
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

      const data: UserImage[] = JSON.parse(responseText); 
      console.log("HomePageContent: Successfully fetched certificate data from API. Count:", data.length);
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

  const handleSearch = (query: string) => {
    setSearchTerm(query.toLowerCase());
  };

  const filteredImages = useMemo(() => {
    if (!searchTerm) return images;
    return images.filter(image => 
      (image.originalName?.toLowerCase() || '').includes(searchTerm) ||
      (image.filename?.toLowerCase() || '').includes(searchTerm)
    );
  }, [images, searchTerm]);

  const searchableImageNames: SearchableItem[] = useMemo(() => {
    return images.map(img => ({
      id: img.fileId,
      value: img.originalName || img.filename,
    }));
  }, [images]);

  return (
    <div className="container mx-auto flex h-[calc(100vh-var(--header-height,4rem))] flex-col px-4 py-4 md:h-auto md:py-8">
      <div className="flex shrink-0 flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="text-center md:text-left">
            <h1 className="text-3xl font-bold font-headline md:text-4xl">Your Certificate Hub</h1>
            <p className="text-lg text-muted-foreground">Browse, upload, and manage your certificates.</p>
        </div>
      </div>
      
      <div className="my-4 shrink-0">
        <SearchWithSuggestions 
          onSearch={handleSearch} 
          placeholder="Search certificates by name or filename..."
          searchableData={searchableImageNames}
        />
      </div>

      <div className="min-h-0 flex-grow overflow-y-auto pr-2 md:overflow-visible md:pr-0">
        <ImageGrid
          images={filteredImages}
          isLoading={isLoading}
          error={error}
          onImageDeleted={triggerRefresh}
          currentUserId={userId}
        />
      </div>

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
