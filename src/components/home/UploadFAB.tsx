
'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UploadModal from './UploadModal';
import { useAuth } from '@/hooks/useAuth';

interface UploadFABProps {
  onUploadSuccess: () => void; // Callback to refresh image grid
}

export default function UploadFAB({ onUploadSuccess }: UploadFABProps) {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <UploadModal
      user={user}
      trigger={
        <Button
          variant="default"
          size="icon"
          className="fixed bottom-16 right-6 md:bottom-8 md:right-8 h-14 w-14 rounded-full shadow-xl z-40 bg-primary hover:bg-primary/90 text-primary-foreground"
          aria-label="Upload Image"
        >
          <Plus className="h-7 w-7" />
        </Button>
      }
      onUploadProcessed={onUploadSuccess} // This will call triggerRefresh in HomePageContent
    />
  );
}
