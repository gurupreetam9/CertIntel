'use client';

import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { ImageIcon } from 'lucide-react';

// This is a placeholder. In a real app, you'd fetch images from your database (MongoDB).
// For now, it shows a message. If you want to display session-uploaded images,
// you'd need to lift state up to the parent page or use a global state manager.
const mockImages = [
  { id: '1', src: 'https://placehold.co/600x400.png?text=My+Image+1', alt: 'Placeholder Image 1', dataAiHint: 'landscape mountain' },
  { id: '2', src: 'https://placehold.co/600x400.png?text=My+Image+2', alt: 'Placeholder Image 2', dataAiHint: 'city skyline' },
  { id: '3', src: 'https://placehold.co/600x400.png?text=My+Image+3', alt: 'Placeholder Image 3', dataAiHint: 'abstract art' },
];


export default function ImageGrid() {
  // const [images, setImages] = useState(mockImages); // Example state if fetching

  if (mockImages.length === 0) {
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
      {mockImages.map((image) => (
        <Card key={image.id} className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 group">
          <CardContent className="p-0">
            <div className="aspect-w-1 aspect-h-1"> {/* Changed to aspect-w-1 aspect-h-1 for square-ish items */}
              <Image
                src={image.src}
                alt={image.alt}
                width={400}
                height={400}
                className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                data-ai-hint={image.dataAiHint}
              />
            </div>
            {/* Future: Add image name or actions here */}
            {/* <div className="p-4">
              <p className="font-medium truncate">{image.alt}</p>
            </div> */}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
