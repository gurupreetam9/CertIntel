
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
  dataAiHint?: string; // Optional, based on what you store
}

export default function ImageGrid() {
  const [images, setImages] = useState<UserImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { userId } = useAuth(); // Get the logged-in user's ID
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      //setError("User not authenticated. Cannot load images."); // Or handle silently
      console.warn("ImageGrid: No userId, cannot fetch images.");
      return;
    }

    const fetchImages = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // IMPORTANT: For production, you'd pass an auth token in headers.
        // For this dev setup, /api/user-images expects userId as a query param.
        const response = await fetch(`/api/user-images?userId=${userId}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Failed to fetch images."}));
          throw new Error(errorData.message || `Error ${response.status}: Failed to load images.`);
        }
        const data: UserImage[] = await response.json();
        setImages(data);
      } catch (err: any) {
        console.error("Failed to fetch images:", err);
        setError(err.message || "Could not load your images.");
        toast({
          title: "Error Loading Images",
          description: err.message || "An unexpected error occurred.",
          variant: "destructive",
        });
      } finally {
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
        <ImageIcon className="w-16 h-16 mb-4" /> {/* Or a more specific error icon */}
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
      {images.map((image) => (
        <Card key={image.fileId} className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 group">
          <CardContent className="p-0">
            <div className="aspect-w-1 aspect-h-1 relative"> {/* Added relative for Next/Image fill */}
              <Image
                src={`/api/images/${image.fileId}`}
                alt={image.originalName || image.filename}
                layout="fill" // Use fill layout
                objectFit="cover" // Ensure image covers the area
                className="group-hover:scale-105 transition-transform duration-300"
                // For next/image with external URLs or dynamic ones, you might need to configure `next.config.js` images.domains
                // However, since /api/images/* is a local API route, it should work without explicit domain whitelisting.
                // Add a placeholder to satisfy next/image if needed, or a blurDataURL for better UX
                placeholder="blur" 
                blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" // Simple 1x1 transparent pixel
                data-ai-hint={image.dataAiHint || 'uploaded image'}
              />
            </div>
            {/* You can add image name or actions here if desired */}
            {/* <div className="p-2 text-center">
              <p className="text-xs font-medium truncate" title={image.originalName}>{image.originalName}</p>
            </div> */}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
