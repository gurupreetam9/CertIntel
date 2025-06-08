
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { signIn } from '@/lib/firebase/auth';
import { SignInSchema, type SignInFormValues } from '@/types/auth';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { AuthError } from 'firebase/auth';
import AppLogo from '@/components/common/AppLogo';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && user) {
      router.push('/');
    }
  }, [user, loading, router]);

  const handleLogin = async (values: SignInFormValues) => {
    const result = await signIn(values);
    if ('code' in result) { // AuthError
      const firebaseError = result as AuthError;
      let errorMessage = 'Login failed. Please try again.';
      if (firebaseError.code === 'auth/user-not-found' || firebaseError.code === 'auth/wrong-password' || firebaseError.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password.';
      }
      toast({
        title: 'Login Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      throw new Error(errorMessage);
    } else { // User
      toast({
        title: 'Login Successful',
        description: 'Welcome back!',
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
        formType="login"
        schema={SignInSchema}
        onSubmit={handleLogin}
        title="Welcome Back!"
        description="Sign in to access your CertIntel."
        submitButtonText="Login"
      />
      <div className="mt-4 text-center text-sm">
        <Link href="/forgot-password" passHref className="text-muted-foreground hover:text-primary hover:underline">
            Forgot password?
        </Link>
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Register here
        </Link>
      </p>
    </div>
  );
}
