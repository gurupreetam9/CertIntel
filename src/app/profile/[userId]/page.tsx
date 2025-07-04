
import { getPublicProfileData_SERVER } from '@/lib/services/userService.server';
import ImageGrid from '@/components/home/ImageGrid';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import AppLogo from '@/components/common/AppLogo';
import Link from 'next/link';
import { ShieldX, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Metadata } from 'next';

export const runtime = 'nodejs';
export const revalidate = 60; // Revalidate public profiles every 60 seconds

// This function can generate metadata for the page for better SEO
export async function generateMetadata({ params }: { params: { userId: string } }): Promise<Metadata> {
  const data = await getPublicProfileData_SERVER(params.userId);

  if ('error' in data || !data.profile) {
    return {
      title: 'Profile Not Found | CertIntel',
      description: 'The requested profile is private or does not exist.',
    };
  }

  return {
    title: `${data.profile.displayName || 'User'}'s Showcase | CertIntel`,
    description: `View the public showcase of certificates for ${data.profile.displayName || 'this user'}.`,
  };
}


// The main page component
export default async function PublicProfilePage({ params }: { params: { userId: string } }) {
  const data = await getPublicProfileData_SERVER(params.userId);

  if ('error' in data) {
    const isPrivate = data.status === 403;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
        <ShieldX className="h-16 w-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold font-headline mb-2">
            {isPrivate ? 'Profile is Private' : 'Profile Not Found'}
        </h1>
        <p className="text-muted-foreground max-w-md">
            {isPrivate 
                ? 'This user has not enabled their public showcase profile. Only they can enable it from their settings.' 
                : 'The profile you are looking for does not exist or the link is incorrect.'}
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Go to Homepage</Link>
        </Button>
      </div>
    );
  }
  
  if (data.profile.role !== 'student') {
      return (
         <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
            <FileWarning className="h-16 w-16 text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold font-headline mb-2">Invalid Profile Type</h1>
            <p className="text-muted-foreground max-w-md">Showcase profiles are only available for student accounts.</p>
             <Button asChild className="mt-6">
                <Link href="/">Go to Homepage</Link>
            </Button>
         </div>
      );
  }

  const { profile, images } = data;
  const userInitial = profile.displayName ? profile.displayName.charAt(0).toUpperCase() : (profile.email ? profile.email.charAt(0).toUpperCase() : '?');

  return (
    <>
        {/* Public Header */}
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
                <Link href="/" aria-label="CertIntel Home">
                    <AppLogo size={7} />
                </Link>
                <Button asChild variant="outline">
                    <Link href="/login">Login / Register</Link>
                </Button>
            </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8 md:px-6 lg:px-8">
            <section className="mb-12 flex flex-col md:flex-row items-center gap-6">
                <Avatar className="h-24 w-24 md:h-32 md:w-32 text-4xl border-4 border-primary">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">{userInitial}</AvatarFallback>
                </Avatar>
                <div className="text-center md:text-left">
                    <h1 className="text-4xl font-bold font-headline">{profile.displayName}</h1>
                    <p className="text-lg text-muted-foreground mt-1">Public Certificate Showcase</p>
                </div>
            </section>

            <section>
                <h2 className="text-2xl font-bold font-headline mb-6 border-b pb-2">Public Certificates</h2>
                <ImageGrid
                    images={images}
                    isLoading={false}
                    error={null}
                    onImageDeleted={() => {}} // No-op for public view
                    currentUserId={profile.uid}
                />
            </section>
        </main>
    </>
  );
}
