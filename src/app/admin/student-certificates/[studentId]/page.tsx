
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
  const { user, userProfile: adminUserProfile, loading: authLoading } = useAuth(); // Renamed userProfile to adminUserProfile for clarity
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

  useEffect(() => {
    if (studentId) {
      setIsLoadingImages(true); // Set loading while fetching student profile too
      getUserProfile(studentId)
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
  }, [studentId]);

  const fetchStudentImages = useCallback(async () => {
    if (!user || adminUserProfile?.role !== 'admin' || !studentId || !studentProfile) {
      setIsLoadingImages(false);
      if (studentProfile === null && studentId) { // If studentProfile failed to load, don't try to fetch images.
          // Error already set by studentProfile fetch.
      } else if (!studentProfile && studentId) {
          // Still waiting for studentProfile to load
      }
      else {
        setImages([]);
      }
      return;
    }

    // Ensure admin is actually linked to this student before fetching
    if (studentProfile.associatedAdminFirebaseId !== user.uid || studentProfile.linkRequestStatus !== 'accepted') {
        setError("Access Denied: You are not linked to this student, or the link is not active.");
        setIsLoadingImages(false);
        setImages([]);
        return;
    }


    setIsLoadingImages(true);
    setError(null);
    try {
      const fetchUrl = `/api/user-images?userId=${studentId}&adminRequesterId=${user.uid}`; 
      const response = await fetch(fetchUrl);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Error ${response.status}` }));
        if (response.status === 403) {
             throw new Error(errorData.message || "Access Denied: You may not have permission to view this student's certificates.");
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
  }, [user, adminUserProfile?.role, studentId, toast, refreshKey, studentProfile]);

  useEffect(() => {
    if (!authLoading && user && adminUserProfile) {
      if (adminUserProfile.role !== 'admin') {
        toast({ title: 'Access Denied', description: 'You are not authorized.', variant: 'destructive' });
        router.replace('/');
      } else if (studentId && studentProfile !== undefined) { // studentProfile could be null if not found, or loaded
        fetchStudentImages();
      }
    }
  }, [user, adminUserProfile, authLoading, studentId, router, toast, fetchStudentImages, studentProfile]);


  if (authLoading || !adminUserProfile || (adminUserProfile.role === 'admin' && studentProfile === undefined) ) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (adminUserProfile.role !== 'admin') {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <ShieldAlert className="mx-auto h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold">Access Denied</h1>
      </div>
    );
  }
  
  const studentNameDisplay = studentProfile?.displayName || studentProfile?.email?.split('@')[0] || "Student";

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
                    {studentNameDisplay}'s Certificates
                </h1>
                {studentProfile?.email && <p className="text-sm text-muted-foreground">{studentProfile.email}</p>}
                {!studentProfile && !isLoadingImages && <p className="text-sm text-destructive">Student details could not be loaded.</p>}
            </div>
        </div>
      </div>

      {error && !isLoadingImages && (
         <div className="flex flex-col items-center justify-center text-center py-12 text-destructive bg-destructive/10 border border-destructive rounded-md">
            <FileWarning className="w-16 h-16 mb-4" />
            <h2 className="text-2xl font-headline mb-2">Could Not Load Certificates</h2>
            <p className="max-w-md">{error}</p>
            { studentProfile && <Button onClick={fetchStudentImages} className="mt-4">Try Again</Button> }
        </div>
      )}

      {!error && studentProfile && (
        <ImageGrid
            images={images}
            isLoading={isLoadingImages}
            error={null} 
            onImageDeleted={triggerRefresh} 
            currentUserId={studentId} 
        />
      )}
       {!error && !studentProfile && !isLoadingImages && (
         <div className="flex flex-col items-center justify-center text-center py-12 text-muted-foreground">
            <UserIcon className="w-16 h-16 mb-4" />
            <h2 className="text-2xl font-headline mb-2">Student Not Found</h2>
            <p className="max-w-md">The details for this student could not be loaded, or they are not linked to you.</p>
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

    