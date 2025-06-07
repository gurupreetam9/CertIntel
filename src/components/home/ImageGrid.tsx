
'use client';

import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { ImageIcon, Loader2, Eye, Trash2, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import ViewImageModal from './ViewImageModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export interface UserImage {
  fileId: string;
  filename: string;
  uploadDate: string;
  contentType: string;
  originalName: string;
  dataAiHint?: string;
  size: number;
  userId?: string; 
}

interface ImageGridProps {
  images: UserImage[];
  isLoading: boolean;
  error: string | null;
  onImageDeleted: () => void; 
  currentUserId: string | null; 
}

export default function ImageGrid({ images, isLoading, error, onImageDeleted, currentUserId }: ImageGridProps) {
  const [selectedImageForView, setSelectedImageForView] = useState<UserImage | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<UserImage | null>(null);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const openViewModal = (image: UserImage) => {
    setSelectedImageForView(image);
    setIsViewModalOpen(true);
  };

  const closeViewModal = () => {
    setIsViewModalOpen(false);
    setSelectedImageForView(null);
  };

  const openDeleteConfirmDialog = (image: UserImage) => {
    setImageToDelete(image);
    setIsConfirmDeleteDialogOpen(true);
  };

  const closeDeleteConfirmDialog = () => {
    setImageToDelete(null);
    setIsConfirmDeleteDialogOpen(false);
  };

  const handleImageLinkOpen = (fileId: string) => {
    window.open(`/api/images/${fileId}`, '_blank');
  };

  const handleDeleteImage = async () => {
    if (!imageToDelete || !currentUserId) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/images/${imageToDelete.fileId}?userId=${currentUserId}`, {
        method: 'DELETE',
      });

      const responseBody = await response.json().catch(() => ({ message: 'Failed to parse delete response from server.'}));

      if (!response.ok) {
        throw new Error(responseBody.message || `Failed to delete image. Status: ${response.status}`);
      }

      toast({
        title: 'Image Deleted',
        description: `"${imageToDelete.originalName}" has been successfully deleted.`,
      });
      onImageDeleted(); 
    } catch (err: any) {
      toast({
        title: 'Error Deleting Image',
        description: err.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      closeDeleteConfirmDialog();
    }
  };


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
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {images.map((image) => {
          const imageSrc = `/api/images/${image.fileId}`;
          return (
            <Card key={image.fileId} className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 group relative">
              <CardContent className="p-0 cursor-pointer" onClick={() => openViewModal(image)}>
                <div className="aspect-square w-full relative">
                  <Image
                    src={imageSrc}
                    alt={image.originalName || image.filename}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    placeholder="blur"
                    blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
                    data-ai-hint={image.dataAiHint || 'uploaded image'}
                    onError={(e) => {
                      console.error(`ImageGrid: Error loading image with src: ${imageSrc}`, e);
                    }}
                  />
                </div>
              </CardContent>
              <div className="absolute top-2 right-2 flex flex-col space-y-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/40 hover:bg-black/60 text-white" onClick={(e) => { e.stopPropagation(); openViewModal(image);}} title="View Image">
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/40 hover:bg-black/60 text-white" onClick={(e) => { e.stopPropagation(); handleImageLinkOpen(image.fileId); }} title="Open Image in New Tab">
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 bg-destructive/70 hover:bg-destructive/90 text-white" onClick={(e) => { e.stopPropagation(); openDeleteConfirmDialog(image);}} title="Delete Image">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-2 text-center bg-card absolute bottom-0 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                 <p className="text-xs font-medium truncate text-card-foreground" title={image.originalName}>{image.originalName}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {selectedImageForView && (
        <ViewImageModal
          isOpen={isViewModalOpen}
          onClose={closeViewModal}
          image={selectedImageForView}
        />
      )}

      {imageToDelete && (
        <AlertDialog open={isConfirmDeleteDialogOpen} onOpenChange={setIsConfirmDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the image
                &quot;{imageToDelete.originalName}&quot;.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={closeDeleteConfirmDialog} disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteImage}
                disabled={isDeleting}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
