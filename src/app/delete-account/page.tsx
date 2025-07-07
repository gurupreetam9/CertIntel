
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ShieldCheck, AlertTriangle, Trash2 } from 'lucide-react';
import AppLogo from '@/components/common/AppLogo';
import Link from 'next/link';

function DeleteAccountPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'invalid_token'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('invalid_token');
      setMessage('No deletion token provided. This link is invalid or has expired.');
    }
  }, [token]);

  const handleConfirmDeletion = async () => {
    if (!token) return;
    setStatus('loading');
    try {
      const response = await fetch('/api/account/delete-confirmed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to delete account.');
      }
      setStatus('success');
      setMessage(result.message);

      setTimeout(() => {
        router.push('/login');
      }, 5000);

    } catch (error: any) {
      setStatus('error');
      setMessage(error.message);
    }
  };
  
  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Loader2 className="animate-spin" /> Deleting Account...</CardTitle>
              <CardDescription>Please wait while we process your request.</CardDescription>
            </CardHeader>
            <CardContent><p className="text-center text-muted-foreground">Your account and data are being permanently removed.</p></CardContent>
          </>
        );
      case 'success':
        return (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600"><ShieldCheck /> Account Deleted</CardTitle>
              <CardDescription>{message}</CardDescription>
            </CardHeader>
            <CardContent><p className="text-center text-muted-foreground">You have been logged out and will be redirected to the login page shortly.</p></CardContent>
          </>
        );
      case 'error':
      case 'invalid_token':
        return (
           <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle /> Deletion Failed</CardTitle>
              <CardDescription>{message}</CardDescription>
            </CardHeader>
            <CardContent><p className="text-center text-muted-foreground">Please return to your profile settings to try again, or contact support if the issue persists.</p></CardContent>
             <CardFooter>
               <Button asChild className="w-full"><Link href="/login">Go to Login</Link></Button>
             </CardFooter>
           </>
        );
      case 'idle':
      default:
        return (
          <>
            <CardHeader>
              <CardTitle className="text-3xl font-headline flex items-center gap-2"><AlertTriangle className="text-destructive" /> Final Confirmation</CardTitle>
              <CardDescription>This is your last chance to cancel. Are you sure you want to proceed?</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-destructive-foreground bg-destructive/90 p-4 rounded-md">
                <strong className="font-semibold block">Warning: This action is permanent and cannot be undone.</strong>
                By clicking the button below, you will permanently delete your CertIntel account, including your profile information and all uploaded certificates.
              </p>
            </CardContent>
            <CardFooter>
              <Button onClick={handleConfirmDeletion} variant="destructive" className="w-full h-auto whitespace-normal py-3">
                <Trash2 className="mr-2 h-4 w-4" /> I understand, permanently delete my account
              </Button>
            </CardFooter>
          </>
        );
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8">
        <Link href="/login" aria-label="CertIntel Login">
          <AppLogo size={40} />
        </Link>
      </div>
      <Card className="w-full max-w-lg shadow-xl">
        {renderContent()}
      </Card>
    </div>
  );
}

// Wrap with Suspense because useSearchParams is a client-side hook that needs it during SSR
export default function DeleteAccountPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
            <DeleteAccountPageContent />
        </Suspense>
    );
}
