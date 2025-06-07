import ProtectedPage from '@/components/auth/ProtectedPage';
import ImageGrid from '@/components/home/ImageGrid';
import UploadFAB from '@/components/home/UploadFAB';
import AiFAB from '@/components/home/AiFAB';

function HomePageContent() {
  return (
    <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8">
      <div className="mb-8 text-center md:text-left">
        <h1 className="text-3xl md:text-4xl font-bold font-headline mb-2">Your Image Gallery</h1>
        <p className="text-muted-foreground text-lg">Browse, upload, and manage your images.</p>
      </div>
      <ImageGrid />
      <UploadFAB />
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
