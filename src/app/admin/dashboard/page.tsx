
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Users, ShieldAlert, Inbox, FileText, ArrowLeft, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { StudentLinkRequest, UserProfile as StudentUserProfile } from '@/lib/models/user';
import { 
  getStudentLinkRequestsForAdmin, 
  updateStudentLinkRequestStatusAndLinkStudent,
  getStudentsForAdmin
} from '@/lib/services/userService';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

function AdminDashboardPageContent() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [pendingRequests, setPendingRequests] = useState<StudentLinkRequest[]>([]);
  const [acceptedStudents, setAcceptedStudents] = useState<StudentUserProfile[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isProcessingRequest, setIsProcessingRequest] = useState<string | null>(null);
  const [currentProcessingStatus, setCurrentProcessingStatus] = useState<'accepted' | 'rejected' | null>(null);


  const fetchPendingRequests = useCallback(async () => {
    if (!user || userProfile?.role !== 'admin') return;
    setIsLoadingRequests(true);
    try {
      const requests = await getStudentLinkRequestsForAdmin(user.uid);
      setPendingRequests(requests);
    } catch (error: any) {
      toast({ title: 'Error Fetching Requests', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoadingRequests(false);
    }
  }, [user, userProfile?.role, toast]);

  const fetchAcceptedStudents = useCallback(async () => {
    if (!user || userProfile?.role !== 'admin') return;
    setIsLoadingStudents(true);
    try {
      const students = await getStudentsForAdmin(user.uid);
      setAcceptedStudents(students);
    } catch (error: any) {
      toast({ title: 'Error Fetching Students', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoadingStudents(false);
    }
  }, [user, userProfile?.role, toast]);


  useEffect(() => {
    if (!authLoading && user && userProfile) {
      if (userProfile.role !== 'admin') {
        toast({ title: 'Access Denied', description: 'You are not authorized to view this page.', variant: 'destructive' });
        router.replace('/'); 
      } else {
        fetchPendingRequests();
        fetchAcceptedStudents();
      }
    }
  }, [user, userProfile, authLoading, router, toast, fetchPendingRequests, fetchAcceptedStudents]);

  const handleResolveRequest = async (requestId: string, newStatus: 'accepted' | 'rejected') => {
    if (!user) return;
    setIsProcessingRequest(requestId);
    setCurrentProcessingStatus(newStatus);
    try {
      await updateStudentLinkRequestStatusAndLinkStudent(requestId, user.uid, newStatus);
      toast({ title: 'Request Resolved', description: `Student request has been ${newStatus}.` });
      fetchPendingRequests(); 
      fetchAcceptedStudents();
    } catch (error: any) {
      toast({ title: 'Error Resolving Request', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessingRequest(null);
      setCurrentProcessingStatus(null);
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
            <CardDescription className="text-muted-foreground">Share this ID with your students so they can link to you upon registration.</CardDescription>
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
                        disabled={isProcessingRequest === req.id}
                      >
                        {isProcessingRequest === req.id && currentProcessingStatus === 'accepted' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4"/>}
                        Accept
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={() => req.id && handleResolveRequest(req.id, 'rejected')}
                        disabled={isProcessingRequest === req.id}
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
              <ul className="space-y-3">
                {acceptedStudents.map(student => (
                  <li key={student.uid} className="p-3 border rounded-md bg-background/50 shadow-sm">
                    <p className="font-semibold">{student.displayName}</p>
                    <p className="text-sm text-muted-foreground">Email: {student.email}</p>
                    {student.rollNo && <p className="text-sm text-muted-foreground">Roll No: {student.rollNo}</p>}
                    <Button size="sm" variant="outline" className="mt-2" asChild>
                      <Link href={`/admin/student-certificates/${student.uid}`}> 
                        <FileText className="mr-2 h-4 w-4"/> View Certificates
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <ProtectedPage>
      <AdminDashboardPageContent />
    </ProtectedPage>
  );
}
