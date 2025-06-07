'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { signUp } from '@/lib/firebase/auth';
import { SignUpSchema, type SignUpFormValues } from '@/types/auth';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { AuthError } from 'firebase/auth';
import AppLogo from '@/components/common/AppLogo';

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && user) {
      router.push('/');
    }
  }, [user, loading, router]);

  const handleRegister = async (values: SignUpFormValues) => {
    const result = await signUp(values);
    if ('code' in result) { // AuthError
      const firebaseError = result as AuthError;
      let errorMessage = 'Registration failed. Please try again.';
      if (firebaseError.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered.';
      }
      toast({
        title: 'Registration Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      throw new Error(errorMessage);
    } else { // User
      toast({
        title: 'Registration Successful',
        description: 'Welcome to ImageVerse!',
      });
      router.push('/');
    }
  };
  
  if (loading || (!loading && user)) {
    return (
     <div className="flex min-h-screen items-center justify-center bg-background">
       {/* Optionally, show a loader or nothing while redirecting */}
     </div>
   );
 }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8">
        <AppLogo size={40} />
      </div>
      <AuthForm
        formType="register"
        schema={SignUpSchema}
        onSubmit={handleRegister}
        title="Create Account"
        description="Join ImageVerse to start managing your images."
        submitButtonText="Register"
      />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Login here
        </Link>
      </p>
    </div>
  );
}
