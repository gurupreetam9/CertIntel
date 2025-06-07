
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AppLogo from '@/components/common/AppLogo';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { initiateEmailOtp, type InitiateEmailOtpOutput } from '@/ai/flows/initiate-email-otp';
import { verifyEmailOtpAndRegister, type VerifyEmailOtpAndRegisterOutput } from '@/ai/flows/verify-email-otp-and-register';

const EmailSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
});
type EmailFormValues = z.infer<typeof EmailSchema>;

const OtpPasswordSchema = z.object({
  otp: z.string().length(6, { message: 'OTP must be 6 digits.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});
type OtpPasswordFormValues = z.infer<typeof OtpPasswordSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1); // 1: Email, 2: OTP + Password
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(EmailSchema),
    defaultValues: { email: '' },
  });

  const otpPasswordForm = useForm<OtpPasswordFormValues>({
    resolver: zodResolver(OtpPasswordSchema),
    defaultValues: { otp: '', password: '' },
  });

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const handleSendOtp = async (values: EmailFormValues) => {
    setIsSubmitting(true);
    setServerError(null);
    try {
      const result: InitiateEmailOtpOutput = await initiateEmailOtp({ email: values.email });
      if (result.success) {
        toast({
          title: 'OTP Sent',
          description: result.message + " Check your server console for the OTP.",
        });
        setEmail(values.email);
        setStep(2);
      } else {
        setServerError(result.message);
        toast({ title: 'Failed to Send OTP', description: result.message, variant: 'destructive' });
      }
    } catch (error: any) {
      const message = error.message || 'An unexpected error occurred while sending OTP.';
      setServerError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyAndRegister = async (values: OtpPasswordFormValues) => {
    setIsSubmitting(true);
    setServerError(null);
    try {
      const result: VerifyEmailOtpAndRegisterOutput = await verifyEmailOtpAndRegister({
        email,
        otp: values.otp,
        password: values.password,
      });

      if (result.success) {
        toast({
          title: 'Registration Successful',
          description: result.message,
        });
        // Firebase auth state change should handle redirect via AuthContext/ProtectedPage
        // Forcing a quicker redirect if needed:
        router.push('/');
      } else {
        setServerError(result.message);
        toast({ title: 'Registration Failed', description: result.message, variant: 'destructive' });
      }
    } catch (error: any) {
      const message = error.message || 'An unexpected error occurred during registration.';
      setServerError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || (!authLoading && user)) {
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
      <Card className="w-full max-w-md shadow-xl">
        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle className="text-3xl font-headline">Create Account - Step 1</CardTitle>
              <CardDescription>Enter your email to receive a verification OTP.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...emailForm}>
                <form onSubmit={emailForm.handleSubmit(handleSendOtp)} className="space-y-6">
                  <FormField
                    control={emailForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="you@example.com" {...field} type="email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {serverError && <p className="text-sm font-medium text-destructive">{serverError}</p>}
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send OTP
                  </Button>
                </form>
              </Form>
            </CardContent>
          </>
        )}

        {step === 2 && (
          <>
            <CardHeader>
              <CardTitle className="text-3xl font-headline">Create Account - Step 2</CardTitle>
              <CardDescription>
                Enter the OTP sent to <span className="font-medium">{email}</span> and set your password.
                (Check server console for OTP).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...otpPasswordForm}>
                <form onSubmit={otpPasswordForm.handleSubmit(handleVerifyAndRegister)} className="space-y-6">
                  <FormField
                    control={otpPasswordForm.control}
                    name="otp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>OTP</FormLabel>
                        <FormControl>
                          <Input placeholder="123456" {...field} type="text" maxLength={6} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={otpPasswordForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input placeholder="••••••••" {...field} type="password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {serverError && <p className="text-sm font-medium text-destructive">{serverError}</p>}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button variant="outline" onClick={() => { setStep(1); setServerError(null); otpPasswordForm.reset(); emailForm.setValue('email', email) }} className="w-full sm:w-auto">
                      Back to Email
                    </Button>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Verify & Register
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Login here
        </Link>
      </p>
    </div>
  );
}
