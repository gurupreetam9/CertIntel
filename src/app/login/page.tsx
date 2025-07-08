
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthForm } from '@/components/auth/AuthForm';
import { signIn } from '@/lib/firebase/auth';
import { SignInSchema, type SignInFormValues } from '@/types/auth';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { AuthError, User } from 'firebase/auth';
import AppLogo from '@/components/common/AppLogo';
import { getUserProfile } from '@/lib/services/userService';
import { initiateLoginOtp } from '@/ai/flows/initiate-login-otp';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const OtpSchema = z.object({
  otp: z.string().length(6, 'Your verification code must be 6 digits.'),
});
type OtpFormValues = z.infer<typeof OtpSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const otpForm = useForm<OtpFormValues>({
    resolver: zodResolver(OtpSchema),
    defaultValues: { otp: '' },
  });

  const handleLogin = async (values: SignInFormValues) => {
    setIsProcessing(true);
    setLoginError(null);
    const result = await signIn(values);

    if ('code' in result) {
      const firebaseError = result as AuthError;
      let errorMessage = 'Login failed. Please try again.';
      if (firebaseError.code === 'auth/user-not-found' || firebaseError.code === 'auth/wrong-password' || firebaseError.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password.';
      }
      setLoginError(errorMessage);
      setIsProcessing(false);
      throw new Error(errorMessage);
    }

    const loggedInUser = result as User;
    const userProfile = await getUserProfile(loggedInUser.uid);
    
    if (userProfile?.isTwoFactorEnabled) {
      toast({
        title: 'Verification Required',
        description: 'Your account has 2FA enabled. Please check your email.',
      });
      setUserEmail(loggedInUser.email);
      await initiateLoginOtp({ email: loggedInUser.email! });
      setStep('otp');
      setIsProcessing(false);
    } else {
      toast({
        title: 'Login Successful',
        description: 'Welcome back!',
      });
      // Fire-and-forget notification for non-2FA users
      loggedInUser.getIdToken().then(token => {
        fetch('/api/auth/login-notify', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(err => console.error("Failed to send login notification:", err));
      });
      router.push('/');
    }
  };

  const handleOtpSubmit = async (values: OtpFormValues) => {
    if (!userEmail) {
        setLoginError('An error occurred. Please try logging in again.');
        return;
    }
    setIsProcessing(true);
    setLoginError(null);

    try {
        const response = await fetch('/api/auth/verify-login-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail, otp: values.otp }),
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to verify code.');
        }

        toast({
            title: 'Login Successful',
            description: 'Welcome back!',
        });
        
        // Fire-and-forget notification now that 2FA is complete
        user?.getIdToken().then(token => {
            fetch('/api/auth/login-notify', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
            }).catch(err => console.error("Failed to send login notification:", err));
        });

        router.push('/');

    } catch (error: any) {
        setLoginError(error.message);
        otpForm.reset();
        setIsProcessing(false);
    }
  };


  if (loading || (!loading && user && step !== 'otp')) {
     return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8">
        <AppLogo size={40} />
      </div>

      {step === 'credentials' && (
        <>
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
        </>
      )}

      {step === 'otp' && (
        <Card className="w-full max-w-md shadow-xl">
            <CardHeader>
                <CardTitle className="text-3xl font-headline">Two-Factor Authentication</CardTitle>
                <CardDescription>
                    A verification code has been sent to <strong>{userEmail}</strong>. Please enter it below to continue.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...otpForm}>
                    <form onSubmit={otpForm.handleSubmit(handleOtpSubmit)} className="space-y-6">
                        <FormField
                            control={otpForm.control}
                            name="otp"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Verification Code</FormLabel>
                                <FormControl>
                                <Input placeholder="123456" {...field} type="text" maxLength={6} autoFocus />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        {loginError && <p className="text-sm font-medium text-destructive">{loginError}</p>}
                        <Button type="submit" className="w-full" disabled={isProcessing}>
                            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Verify & Sign In
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
