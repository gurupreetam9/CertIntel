
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
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
import { signIn, signOut, signInWithCustomToken } from '@/lib/firebase/auth';
import { SignInSchema, type SignInFormValues } from '@/types/auth';
import { Label } from '@/components/ui/label';


export default function LoginPage() {
  const router = useRouter();
  const { loading } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  
  const [userFor2fa, setUserFor2fa] = useState<{ uid: string; email: string } | null>(null);
  const [otpValue, setOtpValue] = useState('');

  const form = useForm<SignInFormValues>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: '', password: '' },
  });
  
  const handlePrimaryLogin = async (values: SignInFormValues) => {
    setIsProcessing(true);
    setLoginError(null);

    try {
      const result = await signIn(values);

      if ('code' in result) {
        const firebaseError = result as AuthError;
        let errorMessage = 'Login failed. Please try again.';
        if (firebaseError.code === 'auth/user-not-found' || firebaseError.code === 'auth/wrong-password' || firebaseError.code === 'auth/invalid-credential') {
          errorMessage = 'Invalid email or password.';
        }
        setLoginError(errorMessage);
        setIsProcessing(false);
        return;
      }

      const loggedInUser = result as User;
      const userProfile = await getUserProfile(loggedInUser.uid);
      
      if (userProfile?.isTwoFactorEnabled) {
        toast({
          title: 'Verification Required',
          description: 'Your account has 2FA enabled. Please check your email for a code.',
        });
        
        // Store user details needed for the next step
        setUserFor2fa({ uid: loggedInUser.uid, email: loggedInUser.email! });
        
        // Initiate the OTP sending process
        await initiateLoginOtp({ email: loggedInUser.email! });
        
        // CRITICAL: Immediately sign the user out of the client to prevent access
        await signOut();
        
        // Move to the OTP entry step
        setStep('otp');
        setIsProcessing(false);

      } else {
        toast({
          title: 'Login Successful',
          description: 'Welcome back!',
        });
        loggedInUser.getIdToken().then(token => {
          fetch('/api/auth/login-notify', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(err => console.error("Failed to send login notification:", err));
        });
        router.push('/');
      }
    } catch (e: any) {
        setLoginError(e.message || "An unexpected error occurred during login.");
        setIsProcessing(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFor2fa) {
        setLoginError('An error occurred. Please try logging in again.');
        return;
    }
    setIsProcessing(true);
    setLoginError(null);

    try {
        const response = await fetch('/api/auth/verify-2fa-and-get-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: userFor2fa.uid, otp: otpValue }),
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to verify code.');
        }

        // Use the custom token from the server to sign in securely
        const finalSignInResult = await signInWithCustomToken(result.token);

        if ('code' in finalSignInResult) {
            throw new Error((finalSignInResult as AuthError).message || 'Final sign-in step failed.');
        }

        toast({
            title: 'Login Successful',
            description: 'Welcome back!',
        });
        
        const finalUser = finalSignInResult as User;
        finalUser.getIdToken().then(token => {
            fetch('/api/auth/login-notify', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
            }).catch(err => console.error("Failed to send login notification:", err));
        });
        router.push('/');

    } catch (error: any) {
        setLoginError(error.message);
        setOtpValue('');
        setIsProcessing(false);
    }
  };

  const handleBackToLogin = () => {
    setStep('credentials');
    setLoginError(null);
    setUserFor2fa(null);
    form.reset();
    setIsProcessing(false);
  }

  if (loading) {
     return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8">
        <Link href="/">
            <AppLogo size={40} />
        </Link>
      </div>

      <Card className="w-full max-w-md shadow-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-headline">{step === 'otp' ? 'Two-Factor Authentication' : 'Welcome Back!'}</CardTitle>
          <CardDescription>
            {step === 'otp'
              ? <>A verification code has been sent to <strong>{userFor2fa?.email}</strong>. Please enter it below.</>
              : 'Sign in to access your CertIntel dashboard.'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'credentials' ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handlePrimaryLogin)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="you@gmail.com" {...field} type="email" disabled={isProcessing}/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input placeholder="••••••••" {...field} type="password" disabled={isProcessing}/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {loginError && <p className="text-sm font-medium text-destructive">{loginError}</p>}
                <Button type="submit" className="w-full" disabled={isProcessing}>
                  {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Login
                </Button>
              </form>
            </Form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="otp-input">Verification Code</Label>
                    <Input 
                        id="otp-input"
                        placeholder="123456" 
                        value={otpValue}
                        onChange={(e) => setOtpValue(e.target.value)}
                        type="text" 
                        maxLength={6} 
                        autoFocus 
                        disabled={isProcessing}
                    />
                </div>
                {loginError && <p className="text-sm font-medium text-destructive">{loginError}</p>}
                <Button type="submit" className="w-full" disabled={isProcessing || otpValue.length !== 6}>
                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify & Sign In
                </Button>
                 <Button variant="link" className="w-full h-auto p-0 text-sm" onClick={handleBackToLogin}>
                    Use a different account
                </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {step === 'credentials' && (
        <>
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
    </div>
  );
}
