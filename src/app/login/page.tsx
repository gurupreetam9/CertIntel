
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
import { signIn } from '@/lib/firebase/auth';
import { SignInSchema, type SignInFormValues } from '@/types/auth';


export default function LoginPage() {
  const router = useRouter();
  const { loading, setIsAwaiting2FA } = useAuth();
  const { toast } = useToast();

  const [isProcessing, setIsProcessing] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [userEmailForOtp, setUserEmailForOtp] = useState<string>('');
  const [otpValue, setOtpValue] = useState('');

  const form = useForm<SignInFormValues>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: '', password: '' },
  });
  
  const handlePasswordLogin = async (values: SignInFormValues) => {
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
        setUserEmailForOtp(loggedInUser.email!);
        setIsAwaiting2FA(true); // Set global 2FA state
        await initiateLoginOtp({ email: loggedInUser.email! });
        setShowOtpInput(true);
      } else {
        toast({
          title: 'Login Successful',
          description: 'Welcome back!',
        });
        setIsAwaiting2FA(false);
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
    } finally {
        if (!showOtpInput) {
            setIsProcessing(false);
        }
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmailForOtp) {
        setLoginError('An error occurred. Please try logging in again.');
        return;
    }
    setIsProcessing(true);
    setLoginError(null);

    try {
        const response = await fetch('/api/auth/verify-login-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmailForOtp, otp: otpValue }),
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to verify code.');
        }

        toast({
            title: 'Login Successful',
            description: 'Welcome back!',
        });
        
        setIsAwaiting2FA(false); // Clear the 2FA state on success
        const currentUser = (await import('@/lib/firebase/auth')).auth.currentUser;
        if(currentUser) {
            currentUser.getIdToken().then(token => {
                fetch('/api/auth/login-notify', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
                }).catch(err => console.error("Failed to send login notification:", err));
            });
        }
        router.push('/');

    } catch (error: any) {
        setLoginError(error.message);
        setOtpValue('');
    } finally {
        setIsProcessing(false);
    }
  };

  const handleBackToLogin = () => {
    setShowOtpInput(false);
    setLoginError(null);
    setIsAwaiting2FA(false); // Also clear 2FA state if they go back
    form.reset();
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
          <CardTitle className="text-3xl font-headline">{showOtpInput ? 'Two-Factor Authentication' : 'Welcome Back!'}</CardTitle>
          <CardDescription>
            {showOtpInput 
              ? <>A verification code has been sent to <strong>{userEmailForOtp}</strong>. Please enter it below.</>
              : 'Sign in to access your CertIntel dashboard.'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showOtpInput ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handlePasswordLogin)} className="space-y-6">
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
                <FormItem>
                    <FormLabel>Verification Code</FormLabel>
                    <FormControl>
                    <Input 
                        placeholder="123456" 
                        value={otpValue}
                        onChange={(e) => setOtpValue(e.target.value)}
                        type="text" 
                        maxLength={6} 
                        autoFocus 
                        disabled={isProcessing}
                    />
                    </FormControl>
                    <FormMessage />
                </FormItem>
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

      {!showOtpInput && (
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
