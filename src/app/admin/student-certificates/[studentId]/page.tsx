
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
import { getUserProfile } from '@/lib/services/userService'; // To fetch student's name
import type { UserProfile as StudentUserProfileType } from '@/lib/models/user';
import Link from 'next/link';

function StudentCertificatesPageContent() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const studentId = params.studentId as string;
  
  const { toast } = useToast();
  const [images, setImages] = useState<UserImage[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [studentProfile, setStudentProfile] = useState<StudentUserProfileType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshKey(prevKey => prevKey + 1);
  }, []);

  // Fetch student's profile to get their name
  useEffect(() => {
    if (studentId) {
      getUserProfile(studentId)
        .then(profile => {
          if (profile && profile.role === 'student') {
            setStudentProfile(profile);
          } else {
            setError("Student profile not found or invalid.");
          }
        })
        .catch(err => {
          console.error("Error fetching student profile:", err);
          setError("Failed to load student details.");
        });
    }
  }, [studentId]);

  // Fetch student's images
  const fetchStudentImages = useCallback(async () => {
    if (!user || userProfile?.role !== 'admin' || !studentId) {
      setIsLoadingImages(false);
      setImages([]);
      return;
    }

    setIsLoadingImages(true);
    setError(null);
    try {
      // The API route /api/user-images needs to be updated to support an admin fetching a student's images
      // Assuming it will take an adminUserId (current user) and studentUserId (from params)
      // For now, we'll structure the call, but the API needs implementation for this specific authorization
      const fetchUrl = `/api/user-images?userId=${studentId}&adminRequesterId=${user.uid}`; 
      const response = await fetch(fetchUrl);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Error ${response.status}` }));
        if (response.status === 403) {
             throw new Error("Access Denied: You may not have permission to view this student's certificates, or they are not linked to you.");
        }
        throw new Error(errorData.message || `Failed to load student certificates.`);
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
  }, [user, userProfile?.role, studentId, toast, refreshKey]);

  useEffect(() => {
    if (!authLoading && user && userProfile) {
      if (userProfile.role !== 'admin') {
        toast({ title: 'Access Denied', description: 'You are not authorized.', variant: 'destructive' });
        router.replace('/');
      } else if (studentId) {
        fetchStudentImages();
      }
    }
  }, [user, userProfile, authLoading, studentId, router, toast, fetchStudentImages]);


  if (authLoading || !userProfile || (userProfile.role === 'admin' && isLoadingImages && !studentProfile) ) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (userProfile.role !== 'admin') {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <ShieldAlert className="mx-auto h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold">Access Denied</h1>
      </div>
    );
  }
  
  const studentName = studentProfile?.displayName || studentProfile?.email?.split('@')[0] || "Student";

  return (
    <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon" aria-label="Back to Admin Dashboard">
                <Link href="/admin/dashboard"><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
            <div>
                <h1 className="text-3xl md:text-4xl font-bold font-headline mb-1 flex items-center">
                    <UserIcon className="mr-3 h-8 w-8 text-primary" />
                    {studentName}'s Certificates
                </h1>
                {studentProfile?.email && <p className="text-sm text-muted-foreground">{studentProfile.email}</p>}
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

      {!error && (
        <ImageGrid
            images={images}
            isLoading={isLoadingImages}
            error={null} // Error is handled above for the whole page
            onImageDeleted={triggerRefresh} // Admin deleting student's image might need different logic/permissions
            currentUserId={studentId} // Critical: This ensures delete operations are for the student
            // TODO: Add a flag or prop to ImageGrid to disable delete/upload for admin view if needed
        />
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
