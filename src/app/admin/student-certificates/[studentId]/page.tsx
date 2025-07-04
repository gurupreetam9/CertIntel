
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import ImageGrid from '@/components/home/ImageGrid';
import type { UserImage } from '@/components/home/ImageGrid';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useRouter, useParams } from 'next/navigation';
import { Loader2, ArrowLeft, User as UserIcon, ShieldAlert, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUserProfile } from '@/lib/services/userService'; 
import type { UserProfile as StudentUserProfileType } from '@/lib/models/user';
import Link from 'next/link';

function StudentCertificatesPageContent() {
  const { user, userProfile: adminUserProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const studentId = params.studentId as string;
  
  const { toast } = useToast();
  const [images, setImages] = useState<UserImage[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [studentProfile, setStudentProfile] = useState<StudentUserProfileType | null>(null); // Student's profile
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshKey(prevKey => prevKey + 1);
  }, []);

  // Fetch student's profile details first
  useEffect(() => {
    if (studentId && adminUserProfile?.role === 'admin') { // Only fetch if admin is viewing
      setIsLoadingImages(true); 
      getUserProfile(studentId) // Uses client-side SDK, fine for displaying name
        .then(profile => {
          if (profile && profile.role === 'student') {
            setStudentProfile(profile);
          } else {
            setError("Student profile not found or role is invalid.");
            setStudentProfile(null);
          }
        })
        .catch(err => {
          console.error("Error fetching student profile:", err);
          setError("Failed to load student details.");
          setStudentProfile(null);
        });
    }
  }, [studentId, adminUserProfile?.role]);

  const fetchStudentImages = useCallback(async () => {
    if (!user || adminUserProfile?.role !== 'admin' || !studentId) {
      setIsLoadingImages(false);
      setImages([]);
      return;
    }
    // Student profile might still be loading here, or failed to load.
    // The API call will do its own checks with Admin SDK.

    setIsLoadingImages(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      if (!idToken) {
        throw new Error("Authentication token not available.");
      }

      const fetchUrl = `/api/user-images?userId=${studentId}&adminRequesterId=${user.uid}`; 
      const response = await fetch(fetchUrl, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Error ${response.status}` }));
        throw new Error(errorData.message || `Failed to load student certificates. Server responded with ${response.status}`);
      }
      const data: UserImage[] = await response.json();
      setImages(data);
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Error Loading Certificates", description: err.message, variant: "destructive" });
      setImages([]);
    } finally {
      setIsLoadingImages(false);
    }
  }, [user, adminUserProfile?.role, studentId, toast, refreshKey]); // Removed studentProfile from deps, API handles it

  useEffect(() => {
    if (!authLoading && user && adminUserProfile) {
      if (adminUserProfile.role !== 'admin') {
        toast({ title: 'Access Denied', description: 'You are not authorized.', variant: 'destructive' });
        router.replace('/');
      } else if (studentId) { 
        fetchStudentImages(); // Fetch images once admin role is confirmed
      }
    }
  }, [user, adminUserProfile, authLoading, studentId, router, toast, fetchStudentImages]);


  if (authLoading || !adminUserProfile || (adminUserProfile.role === 'admin' && studentProfile === undefined && studentId)) {
    // Show loader if auth is loading, or if admin is viewing this page and student profile hasn't loaded/failed yet
    return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (adminUserProfile.role !== 'admin') {
    // This case should be caught by ProtectedPage or the effect above, but as a fallback:
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <ShieldAlert className="mx-auto h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold">Access Denied</h1>
      </div>
    );
  }
  
  const studentNameDisplay = studentProfile?.displayName || studentProfile?.email?.split('@')[0] || (studentId ? "Student" : "Loading student...");

  return (
    <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon" aria-label="Back to Admin Dashboard">
                <Link href="/admin/dashboard"><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold font-headline mb-1 flex items-center">
                    <UserIcon className="mr-3 h-8 w-8 text-primary" />
                    {studentNameDisplay}'s Certificates
                </h1>
                {studentProfile?.email && <p className="text-sm text-muted-foreground">{studentProfile.email}</p>}
                {!studentProfile && !isLoadingImages && !error && studentId && <p className="text-sm text-muted-foreground">Loading student details...</p>}
            </div>
        </div>
      </div>

      {error && !isLoadingImages && (
         <div className="flex flex-col items-center justify-center text-center py-12 text-destructive bg-destructive/10 border border-destructive rounded-md">
            <FileWarning className="w-16 h-16 mb-4" />
            <h2 className="text-2xl font-headline mb-2">Could Not Load Certificates</h2>
            <p className="max-w-md">{error}</p>
            <Button onClick={fetchStudentImages} className="mt-4">Try Again</Button>
        </div>
      )}

      {!error && ( // Render ImageGrid even if studentProfile is still loading, API will handle auth
        <ImageGrid
            images={images}
            isLoading={isLoadingImages} // ImageGrid loading is tied to image fetching
            error={null} // Error is handled above
            onImageDeleted={triggerRefresh} 
            currentUserId={studentId} 
        />
      )}
       {!error && !studentProfile && !isLoadingImages && !studentId && ( // Case where studentId itself is missing
         <div className="flex flex-col items-center justify-center text-center py-12 text-muted-foreground">
            <UserIcon className="w-16 h-16 mb-4" />
            <h2 className="text-2xl font-headline mb-2">Student Not Specified</h2>
            <p className="max-w-md">No student ID was provided to view certificates.</p>
        </div>
       )}
    </div>
  );
}

export default function StudentCertificatesPage() {
  return (
    <ProtectedPage>
      <StudentCertificatesPageContent />
    </ProtectedPage>
  );
}
