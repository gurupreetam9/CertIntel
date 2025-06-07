
'use client';

import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { ImageIcon, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface UserImage {
  fileId: string;
  filename: string;
  uploadDate: string;
  contentType: string;
  originalName: string;
  dataAiHint?: string; 
  size: number;
}

export default function ImageGrid() {
  const [images, setImages] = useState<UserImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { userId } = useAuth(); 
  const { toast } = useToast();

  useEffect(() => {
    console.log("ImageGrid: useEffect triggered. Current userId:", userId);
    if (!userId) {
      setIsLoading(false);
      console.warn("ImageGrid: No userId, cannot fetch images. User might not be logged in or auth state still loading.");
      // setError("User not authenticated. Cannot load images."); // Optionally set error
      return;
    }

    const fetchImages = async () => {
      console.log("ImageGrid: Starting fetchImages for userId:", userId);
      setIsLoading(true);
      setError(null);
      try {
        const fetchUrl = `/api/user-images?userId=${userId}`;
        console.log("ImageGrid: Fetching from URL:", fetchUrl);
        const response = await fetch(fetchUrl);
        console.log("ImageGrid: Fetch response status:", response.status);

        if (!response.ok) {
          let errorData = { message: `Error ${response.status}: Failed to load images.` };
          try {
            errorData = await response.json();
          } catch (jsonError) {
            console.error("ImageGrid: Could not parse error JSON from server:", jsonError);
          }
          console.error("ImageGrid: Fetch images failed.", errorData);
          throw new Error(errorData.message || `Error ${response.status}: Failed to load images.`);
        }
        const data: UserImage[] = await response.json();
        console.log("ImageGrid: Successfully fetched image data. Count:", data.length, "Sample data:", data.slice(0,2));
        setImages(data);
      } catch (err: any) {
        console.error("ImageGrid: Error in fetchImages:", err);
        setError(err.message || "Could not load your images.");
        toast({
          title: "Error Loading Images",
          description: err.message || "An unexpected error occurred.",
          variant: "destructive",
        });
      } finally {
        console.log("ImageGrid: fetchImages finished. Setting isLoading to false.");
        setIsLoading(false);
      }
    };

    fetchImages();
  }, [userId, toast]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <Loader2 className="w-16 h-16 text-primary animate-spin mb-4" />
        <h2 className="text-2xl font-headline mb-2">Loading Your Images...</h2>
        <p className="text-muted-foreground">Please wait a moment.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12 text-destructive">
        <ImageIcon className="w-16 h-16 mb-4" /> 
        <h2 className="text-2xl font-headline mb-2">Error Loading Images</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <ImageIcon className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-headline mb-2">Your ImageVerse is Empty</h2>
        <p className="text-muted-foreground">Start by uploading your first image using the &apos;+&apos; button.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {images.map((image) => {
        const imageSrc = `/api/images/${image.fileId}`;
        // console.log(`ImageGrid: Rendering image. Original: ${image.originalName}, fileId: ${image.fileId}, src: ${imageSrc}`);
        return (
          <Card key={image.fileId} className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 group">
            <CardContent className="p-0">
              <div className="aspect-square w-full relative"> 
                <Image
                  src={imageSrc}
                  alt={image.originalName || image.filename}
                  layout="fill" 
                  objectFit="cover" 
                  className="group-hover:scale-105 transition-transform duration-300"
                  placeholder="blur" 
                  blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" 
                  data-ai-hint={image.dataAiHint || 'uploaded image'}
                  onError={(e) => {
                    console.error(`ImageGrid: Error loading image with src: ${imageSrc}`, e);
                    // You could set a fallback image source here for this specific image if needed
                    // e.currentTarget.src = '/placeholder-error.png'; 
                  }}
                />
              </div>
               {/* <div className="p-2 text-center">
                 <p className="text-xs font-medium truncate" title={image.originalName}>{image.originalName} ({ (image.size / (1024*1024)).toFixed(2) } MB)</p>
               </div> */}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
