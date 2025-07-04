
'use client';

import Image from 'next/image';
import { Card, CardContent, CardDescription } from '@/components/ui/card';
import { ImageIcon, Loader2, Eye, Trash2, ExternalLink, Download, FileText, Bot, Sparkles, Pencil } from 'lucide-react';
import { useState, useCallback } from 'react';
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
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

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

// Helper function to convert a fetched image URL (Blob) to Data URI
const blobToDataUri = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsDataURL(blob);
  });
};


export default function ImageGrid({ images, isLoading, error, onImageDeleted, currentUserId }: ImageGridProps) {
  const { toast } = useToast();
  const { user, userId: loggedInUserId } = useAuth();

  const [selectedImageForView, setSelectedImageForView] = useState<UserImage | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  
  const [imageToDelete, setImageToDelete] = useState<UserImage | null>(null);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [imageToEdit, setImageToEdit] = useState<UserImage | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [newName, setNewName] = useState('');
  
  const [generatingDescriptionFor, setGeneratingDescriptionFor] = useState<string | null>(null);

  const canEdit = loggedInUserId === currentUserId;

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

  const openEditModal = (image: UserImage) => {
    setImageToEdit(image);
    setNewName(image.originalName);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setImageToEdit(null);
    setNewName('');
  };

  const handleUpdateName = async () => {
    if (!imageToEdit || !newName.trim() || !user) return;
    setIsUpdatingName(true);
    try {
        const idToken = await user.getIdToken();
        const response = await fetch(`/api/images/${imageToEdit.fileId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({ newName: newName.trim() }),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || 'Failed to update file name.');
        }

        toast({
            title: 'Name Updated',
            description: `"${imageToEdit.originalName}" was renamed to "${newName.trim()}".`,
        });
        onImageDeleted();
        closeEditModal();
    } catch (err: any) {
        toast({
            title: 'Update Failed',
            description: err.message,
            variant: 'destructive',
        });
    } finally {
        setIsUpdatingName(false);
    }
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
        throw new Error(responseBody.message || `Failed to delete file. Status: ${response.status}`);
      }

      toast({
        title: 'File Deleted',
        description: `"${imageToDelete.originalName}" has been successfully deleted.`,
      });
      onImageDeleted();
    } catch (err: any) {
      toast({
        title: 'Error Deleting File',
        description: err.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      closeDeleteConfirmDialog();
    }
  };

  const handleRequestAIDescription = async (image: UserImage) => {
    if (image.contentType === 'application/pdf') {
        toast({ title: 'Not an Image', description: 'AI descriptions are only available for image files.', variant: 'destructive' });
        return;
    }
    setGeneratingDescriptionFor(image.fileId);
    toast({ title: 'Generating AI Description', description: `Requesting description for ${image.originalName}...` });

    try {
        const imageResponse = await fetch(`/api/images/${image.fileId}`);
        if (!imageResponse.ok) {
            throw new Error(`Failed to fetch image data: ${imageResponse.statusText}`);
        }
        const imageBlob = await imageResponse.blob();
        const photoDataUri = await blobToDataUri(imageBlob);

        const descriptionApiResponse = await fetch('/api/ai/generate-description', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoDataUri }),
        });

        const result = await descriptionApiResponse.json();
        if (!descriptionApiResponse.ok) {
            throw new Error(result.message || 'Failed to generate AI description from API.');
        }

        if (result.description) {
            toast({ 
                title: `AI Description for ${image.originalName}`, 
                description: result.description,
                duration: 10000 // Keep toast longer for reading
            });
        } else {
            throw new Error('AI did not return a description.');
        }

    } catch (err: any) {
        console.error("Error requesting AI description:", err);
        toast({ title: 'AI Description Failed', description: err.message, variant: 'destructive' });
    } finally {
        setGeneratingDescriptionFor(null);
    }
  };


  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center py-4 sm:py-8 md:py-12">
        <Loader2 className="w-12 h-12 sm:w-16 sm:h-16 text-primary animate-spin mb-4" />
        <h2 className="text-xl sm:text-2xl font-headline mb-2">Loading Your Certificates...</h2>
        <p className="text-muted-foreground text-sm sm:text-base">Please wait a moment.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center py-4 sm:py-8 md:py-12 text-destructive">
        <FileText className="w-12 h-12 sm:w-16 sm:h-16 mb-4" />
        <h2 className="text-xl sm:text-2xl font-headline mb-2">Error Loading Certificates</h2>
        <p className="text-sm sm:text-base">{error}</p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center py-4 sm:py-8 md:py-12">
        <FileText className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl sm:text-2xl font-headline mb-2">Your CertIntel Hub is Empty</h2>
        <p className="text-muted-foreground text-sm sm:text-base">Start by uploading your first certificate using the &apos;+&apos; button.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((image) => {
          const imageSrc = `/api/images/${image.fileId}`;
          const isPdf = image.contentType === 'application/pdf';
          const imageFitClass = 'object-contain'; 

          return (
            <Card key={image.fileId} className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 group relative flex flex-col">
              <CardContent className="p-0 cursor-pointer flex-shrink-0" onClick={() => openViewModal(image)}>
                <div className="aspect-square w-full relative flex items-center justify-center">
                  {isPdf ? (
                     <FileText className="w-1/2 h-1/2 text-muted-foreground" />
                  ) : (
                    <Image
                      src={imageSrc}
                      alt={image.originalName || image.filename}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className={`${imageFitClass} group-hover:scale-105 transition-transform duration-300`}
                      placeholder="blur"
                      blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
                      data-ai-hint={image.dataAiHint || 'uploaded certificate'}
                      onError={(e) => {
                        console.error(`ImageGrid: Error loading image with src: ${imageSrc}`, e);
                      }}
                    />
                  )}
                </div>
              </CardContent>
              <div className="absolute top-2 right-2 flex flex-col space-y-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/40 hover:bg-black/60 text-white" onClick={(e) => { e.stopPropagation(); openViewModal(image);}} title="View File">
                  <Eye className="h-4 w-4" />
                </Button>
                {canEdit && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/40 hover:bg-black/60 text-white" onClick={(e) => { e.stopPropagation(); openEditModal(image);}} title="Edit Name">
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/40 hover:bg-black/60 text-white" onClick={(e) => { e.stopPropagation(); handleImageLinkOpen(image.fileId); }} title="Open File in New Tab">
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-black/40 hover:bg-black/60 text-white"
                  title="Download File"
                  onClick={(e) => e.stopPropagation()}
                >
                  <a
                    href={`/api/images/${image.fileId}`}
                    download={image.originalName || image.filename}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
                 {!isPdf && (
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 bg-black/40 hover:bg-black/60 text-white" 
                        onClick={(e) => { e.stopPropagation(); handleRequestAIDescription(image);}} 
                        title="Get AI Description"
                        disabled={generatingDescriptionFor === image.fileId}
                    >
                        {generatingDescriptionFor === image.fileId ? <Loader2 className="h-4 w-4 animate-spin"/> : <Bot className="h-4 w-4" />}
                    </Button>
                )}
                {canEdit && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 bg-destructive/70 hover:bg-destructive/90 text-white" onClick={(e) => { e.stopPropagation(); openDeleteConfirmDialog(image);}} title="Delete File">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="p-3 mt-auto border-t bg-card">
                 <p className="text-sm font-medium truncate text-card-foreground mb-1" title={image.originalName}>{image.originalName}</p>
                 {/* Removed AI description rendering from here */}
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

      {isEditModalOpen && imageToEdit && (
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Certificate Name</DialogTitle>
                    <DialogDescription>
                        Enter a new name for the file: &quot;{imageToEdit.originalName}&quot;.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="newName">New Name</Label>
                    <Input
                        id="newName"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Enter new certificate name"
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={closeEditModal} disabled={isUpdatingName}>Cancel</Button>
                    <Button onClick={handleUpdateName} disabled={isUpdatingName || !newName.trim()}>
                        {isUpdatingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}

      {imageToDelete && (
        <AlertDialog open={isConfirmDeleteDialogOpen} onOpenChange={setIsConfirmDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the file
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
