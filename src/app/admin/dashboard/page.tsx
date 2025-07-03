
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Users, ShieldAlert, Inbox, FileText, ArrowLeft, Copy, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { StudentLinkRequest, UserProfile as StudentUserProfile } from '@/lib/models/user';
import { 
  getStudentLinkRequestsForAdminRealtime, 
  updateStudentLinkRequestStatusAndLinkStudent,
  getStudentsForAdminRealtime,
  adminRemoveStudentLink
} from '@/lib/services/userService';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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

function AdminDashboardPageContent() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [pendingRequests, setPendingRequests] = useState<StudentLinkRequest[]>([]);
  const [acceptedStudents, setAcceptedStudents] = useState<StudentUserProfile[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true); 
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isProcessingRequest, setIsProcessingRequest] = useState<string | null>(null);
  const [currentProcessingStatus, setCurrentProcessingStatus] = useState<'accepted' | 'rejected' | null>(null);
  
  const [studentToRemove, setStudentToRemove] = useState<StudentUserProfile | null>(null);
  const [isRemovingStudent, setIsRemovingStudent] = useState(false);


  useEffect(() => {
    if (!user || userProfile?.role !== 'admin' || authLoading) {
      if (!authLoading && user && userProfile?.role !== 'admin') {
        toast({ title: 'Access Denied', description: 'You are not authorized.', variant: 'destructive' });
        router.replace('/');
      }
      return;
    }

    const currentAdminUid = user.uid;

    setIsLoadingRequests(true);
    const unsubscribePendingRequests = getStudentLinkRequestsForAdminRealtime(
      currentAdminUid,
      (requests) => {
        setPendingRequests(requests);
        setIsLoadingRequests(false); 
        console.log("AdminDashboard: Pending requests updated from real-time listener. Count:", requests.length);
      },
      (error) => {
        toast({ title: 'Error Fetching Pending Requests', description: error.message, variant: 'destructive' });
        setIsLoadingRequests(false); 
        console.error("AdminDashboard: Error from real-time pending requests listener:", error);
      }
    );

    setIsLoadingStudents(true);
    const unsubscribeAcceptedStudents = getStudentsForAdminRealtime(
      currentAdminUid,
      (newStudents) => {
        setAcceptedStudents(prevStudents => {
          const newStudentsJSON = JSON.stringify(newStudents.map(s => ({ uid: s.uid, rollNo: s.rollNo, displayName: s.displayName })));
          const prevStudentsJSON = JSON.stringify(prevStudents.map(s => ({ uid: s.uid, rollNo: s.rollNo, displayName: s.displayName })));

          if (prevStudentsJSON !== newStudentsJSON) {
            console.log("%cAdminDashboard: Accepted students list content HAS CHANGED.", "color: blue; font-weight:bold;");
            const studentDetailsForLog = newStudents.map(s => ({ uid: s.uid, displayName: s.displayName, rollNo: s.rollNo, email: s.email, linkStatus: s.linkRequestStatus }));
            console.log("AdminDashboard: PREVIOUS accepted students (UID, RollNo, Name):", prevStudentsJSON);
            console.log("AdminDashboard: NEW accepted students (Full Details):", JSON.stringify(studentDetailsForLog, null, 2));
          } else if (prevStudents.length === 0 && newStudents.length === 0) {
            console.log("AdminDashboard: Accepted students list remains empty (initial or no change).");
          } else {
            console.log("AdminDashboard: Accepted students list received, but content appears IDENTICAL to previous state based on UID, RollNo, DisplayName check.");
          }
          return newStudents;
        });
        setIsLoadingStudents(false);
      },
      (error) => {
        toast({ title: 'Error Fetching Accepted Students', description: error.message, variant: 'destructive' });
        setIsLoadingStudents(false);
        console.error("AdminDashboard: Error from real-time accepted students listener:", error);
      }
    );

    return () => {
      if (unsubscribePendingRequests) {
        console.log("AdminDashboard: Unsubscribing from pending requests listener.");
        unsubscribePendingRequests();
      }
      if (unsubscribeAcceptedStudents) {
        console.log("AdminDashboard: Unsubscribing from accepted students listener.");
        unsubscribeAcceptedStudents();
      }
    };
  }, [user, userProfile?.role, authLoading, toast, router]);


  const handleResolveRequest = async (requestId: string, newStatus: 'accepted' | 'rejected') => {
    if (!user) return;
    setIsProcessingRequest(requestId);
    setCurrentProcessingStatus(newStatus);
    try {
      await updateStudentLinkRequestStatusAndLinkStudent(requestId, user.uid, newStatus);
      toast({ title: 'Request Resolved', description: `Student request has been ${newStatus}.` });
    } catch (error: any) {
      toast({ title: 'Error Resolving Request', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessingRequest(null);
      setCurrentProcessingStatus(null);
    }
  };
  
  const handleConfirmRemove = async () => {
    if (!studentToRemove || !user) return;

    setIsRemovingStudent(true);
    try {
        const result = await adminRemoveStudentLink(user.uid, studentToRemove.uid);
        if (result.success) {
            toast({
                title: 'Student Unlinked',
                description: `${studentToRemove.displayName} has been successfully unlinked.`,
            });
        } else {
            toast({
                title: 'Unlinking Failed',
                description: result.message,
                variant: 'destructive',
            });
        }
    } catch (error: any) {
        toast({
            title: 'Error',
            description: error.message || 'An unexpected error occurred.',
            variant: 'destructive',
        });
    } finally {
        setIsRemovingStudent(false);
        setStudentToRemove(null); // Close the dialog
    }
  };

  const copyAdminId = () => {
    if (userProfile?.adminUniqueId) {
      navigator.clipboard.writeText(userProfile.adminUniqueId)
        .then(() => toast({ title: 'Admin ID Copied!', description: 'Your unique Admin ID has been copied to the clipboard.'}))
        .catch(() => toast({ title: 'Copy Failed', description: 'Could not copy Admin ID.', variant: 'destructive'}));
    }
  };

  if (authLoading || !userProfile) {
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
        <p className="text-muted-foreground">This area is for administrators only.</p>
        <Button asChild className="mt-6"><Link href="/">Go to Homepage</Link></Button>
      </div>
    );
  }

  return (
    <>
      <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8">
        <div className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
              <Button asChild variant="outline" size="icon" aria-label="Back to Home">
                  <Link href="/"><ArrowLeft className="h-5 w-5" /></Link>
              </Button>
              <h1 className="text-3xl font-bold font-headline">Admin Dashboard</h1>
          </div>
        </div>
        
        {userProfile.adminUniqueId && (
          <Card className="mb-8 bg-primary/5 border-primary/20 shadow-md">
            <CardHeader>
              <CardTitle className="text-primary text-xl">Your Unique Admin ID</CardTitle>
              <CardDescription className="text-muted-foreground">Share this ID with your students so they can link to you upon registration or from their profile.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-x-3">
              <p className="text-lg font-mono bg-primary/10 text-primary-foreground px-4 py-2 rounded-md inline-block shadow-sm">{userProfile.adminUniqueId}</p>
              <Button variant="outline" size="icon" onClick={copyAdminId} title="Copy Admin ID">
                <Copy className="h-4 w-4"/>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Inbox className="text-primary"/> Pending Student Link Requests</CardTitle>
              <CardDescription>Review and approve or reject requests from students to link with you.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingRequests ? ( 
                <div className="flex justify-center items-center py-6"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : pendingRequests.length === 0 ? (
                <p className="text-muted-foreground italic">No pending requests at this time.</p>
              ) : (
                <ul className="space-y-3">
                  {pendingRequests.map(req => (
                    <li key={req.id} className="p-3 border rounded-md bg-background/50 shadow-sm">
                      <p className="font-semibold">{req.studentName}</p>
                      <p className="text-sm text-muted-foreground">Email: {req.studentEmail}</p>
                      {req.studentRollNo && <p className="text-sm text-muted-foreground">Roll No: {req.studentRollNo}</p>}
                      <p className="text-xs text-muted-foreground mt-1">Requested: {new Date(req.requestedAt.seconds * 1000).toLocaleDateString()}</p>
                      <div className="mt-3 flex gap-2">
                        <Button 
                          size="sm" 
                          variant="default" 
                          onClick={() => req.id && handleResolveRequest(req.id, 'accepted')}
                          disabled={isProcessingRequest === req.id || isRemovingStudent}
                        >
                          {isProcessingRequest === req.id && currentProcessingStatus === 'accepted' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4"/>}
                          Accept
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          onClick={() => req.id && handleResolveRequest(req.id, 'rejected')}
                          disabled={isProcessingRequest === req.id || isRemovingStudent}
                        >
                           {isProcessingRequest === req.id && currentProcessingStatus === 'rejected' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <XCircle className="mr-2 h-4 w-4"/>}
                          Reject
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="text-green-600 dark:text-green-400"/> Your Accepted Students</CardTitle>
              <CardDescription>View students who are currently linked to your admin account.</CardDescription>
            </CardHeader>
            <CardContent>
               {isLoadingStudents ? (
                <div className="flex justify-center items-center py-6"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : acceptedStudents.length === 0 ? (
                <p className="text-muted-foreground italic">You have not accepted any students yet.</p>
              ) : (
                <ul className="space-y-4">
                  {acceptedStudents.map(student => (
                    <li key={student.uid} className="border rounded-lg p-4 shadow-sm bg-card">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-grow">
                          <p className="text-lg font-semibold text-foreground">{student.displayName}</p>
                          <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                            <p>Email: {student.email}</p>
                            {student.rollNo && (<p>Roll No: {student.rollNo}</p>)}
                          </div>
                        </div>
                        <div className="mt-2 flex-shrink-0 sm:mt-0 flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/admin/student-certificates/${student.uid}`}>
                              <FileText className="mr-2 h-4 w-4" />
                              View Certificates
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setStudentToRemove(student)}
                            disabled={isProcessingRequest !== null || isRemovingStudent}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Remove
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <AlertDialog open={!!studentToRemove} onOpenChange={(open) => !open && setStudentToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will unlink the student{' '}
              <span className="font-bold">{studentToRemove?.displayName}</span> from your account. They will have to send a new request to link again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemovingStudent} onClick={() => setStudentToRemove(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              disabled={isRemovingStudent}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isRemovingStudent && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes, Unlink Student
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function AdminDashboardPage() {
  return (
    <ProtectedPage>
      <AdminDashboardPageContent />
    </ProtectedPage>
  );
}
