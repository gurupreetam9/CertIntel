'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AppLogo from '@/components/common/AppLogo';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Shield, ArrowRight, CheckSquare, Square } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { initiateEmailOtp, type InitiateEmailOtpOutput } from '@/ai/flows/initiate-email-otp';
import { verifyRegistrationOtp, type VerifyRegistrationOtpOutput } from '@/ai/flows/verify-registration-otp';
import type { UserRole } from '@/lib/models/user';
import { signUp } from '@/lib/firebase/auth';
import type { AuthError, User as FirebaseUser } from 'firebase/auth';

// Schemas for different steps/roles
const RoleSelectionSchema = z.object({
  role: z.enum(['student', 'admin'], { required_error: 'Please select a role.' }),
});
type RoleSelectionFormValues = z.infer<typeof RoleSelectionSchema>;

const EmailSchema = z.object({
  email: z.string().email({ message: 'Invalid email address format.' }).refine(val => val.endsWith('@gmail.com'), { message: 'Only Gmail accounts are supported at this time.' }),
});
type EmailFormValues = z.infer<typeof EmailSchema>;

const StudentDetailsSchema = z.object({
  name: z.string().min(1, 'Name is required.').max(100, 'Name is too long.'),
  rollNo: z.string().max(50, 'Roll number is too long.').optional(),
  teacherId: z.string().max(50, 'Teacher ID is too long.').optional(),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  otp: z.string().length(6, { message: 'OTP must be 6 digits.' }),
  isTwoFactorEnabled: z.boolean().default(false).optional(),
});
type StudentDetailsFormValues = z.infer<typeof StudentDetailsSchema>;

const AdminDetailsSchema = z.object({
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  otp: z.string().length(6, { message: 'OTP must be 6 digits.' }),
  isTwoFactorEnabled: z.boolean().default(false).optional(),
});
type AdminDetailsFormValues = z.infer<typeof AdminDetailsSchema>;


export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showTeacherIdField, setShowTeacherIdField] = useState(false);
  
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendAttempts, setResendAttempts] = useState(0);
  const maxResendAttempts = 3;
  const cooldownDuration = 60; // seconds

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const roleForm = useForm<RoleSelectionFormValues>({ resolver: zodResolver(RoleSelectionSchema) });
  const emailForm = useForm<EmailFormValues>({ resolver: zodResolver(EmailSchema), defaultValues: { email: '' } });
  const studentDetailsForm = useForm<StudentDetailsFormValues>({ resolver: zodResolver(StudentDetailsSchema), defaultValues: { name: '', rollNo: '', teacherId: '', password: '', otp: '', isTwoFactorEnabled: false } });
  const adminDetailsForm = useForm<AdminDetailsFormValues>({ resolver: zodResolver(AdminDetailsSchema), defaultValues: { password: '', otp: '', isTwoFactorEnabled: false } });

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/');
    }
  }, [user, authLoading, router]);
  
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleRoleSelection = (values: RoleSelectionFormValues) => {
    setSelectedRole(values.role);
    setStep(2);
    setServerError(null);
  };

  const handleEmailSubmitAndSendOtp = async (values: EmailFormValues) => {
    setIsSubmitting(true);
    setServerError(null);
    setResendAttempts(0);
    if (timerRef.current) clearInterval(timerRef.current);
    setResendCooldown(0);

    try {
      const result: InitiateEmailOtpOutput = await initiateEmailOtp({ email: values.email });
      if (result.success) {
        toast({
          title: 'OTP Sent',
          description: result.message,
        });
        setEmail(values.email);
        setStep(3);

        setResendCooldown(cooldownDuration);
        timerRef.current = setInterval(() => {
            setResendCooldown(prev => {
                if (prev <= 1) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

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
  
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isResending || resendAttempts >= maxResendAttempts) return;

    setIsResending(true);
    setResendAttempts(prev => prev + 1);

    const result = await initiateEmailOtp({ email });

    if (result.success) {
        toast({ title: 'New OTP Sent', description: result.message });
        
        setResendCooldown(cooldownDuration);
        timerRef.current = setInterval(() => {
            setResendCooldown(prev => {
                if (prev <= 1) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

    } else {
        toast({ title: 'Failed to Resend', description: result.message, variant: 'destructive' });
        setResendAttempts(prev => prev - 1);
    }
    setIsResending(false);
  };
  
  const handleFinalRegistration = async (values: StudentDetailsFormValues | AdminDetailsFormValues) => {
    if (!selectedRole || !email) {
      setServerError("Role or email not set. Please restart registration.");
      return;
    }
    setIsSubmitting(true);
    setServerError(null);

    try {
      // Step 1: Verify OTP
      const otpResult: VerifyRegistrationOtpOutput = await verifyRegistrationOtp({ email, otp: values.otp });
      if (!otpResult.success) {
        throw new Error(otpResult.message);
      }
      toast({ title: 'OTP Verified', description: 'Proceeding with account creation...' });

      // Step 2: Create Firebase Auth user on the client
      const signUpResult = await signUp({ email, password: values.password });
      if ('code' in signUpResult) { // AuthError
        throw new Error((signUpResult as AuthError).message);
      }
      const newUser = signUpResult as FirebaseUser;
      const idToken = await newUser.getIdToken();

      // Step 3: Create Firestore profile on the server
      const profilePayload: any = {
        role: selectedRole,
        isTwoFactorEnabled: values.isTwoFactorEnabled,
      };

      if (selectedRole === 'student') {
        const studentValues = values as StudentDetailsFormValues;
        profilePayload.name = studentValues.name;
        profilePayload.rollNo = studentValues.rollNo || undefined;
        profilePayload.adminUniqueId = studentValues.teacherId || undefined;
      }
      
      const createProfileResponse = await fetch('/api/auth/create-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(profilePayload),
      });

      const profileResult = await createProfileResponse.json();

      if (!createProfileResponse.ok) {
        throw new Error(profileResult.message || "Failed to create user profile on server.");
      }

      toast({
        title: 'Registration Successful',
        description: profileResult.message,
        duration: profileResult.adminUniqueIdGenerated ? 10000 : 5000,
      });

      router.push('/');

    } catch (error: any) {
      const message = error.message || 'An unexpected error occurred during registration.';
      setServerError(message);
      toast({ title: 'Registration Failed', description: message, variant: 'destructive' });
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
        <Link href="/" aria-label="CertIntel Home"> <AppLogo size={40} /> </Link>
      </div>
      <Card className="w-full max-w-md shadow-xl">
        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle className="text-3xl font-headline">Join CertIntel As</CardTitle>
              <CardDescription>First, tell us who you are.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...roleForm}>
                <form onSubmit={roleForm.handleSubmit(handleRoleSelection)} className="space-y-6">
                  <FormField
                    control={roleForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="flex flex-col space-y-1"
                          >
                            <FormItem className="flex items-center space-x-3 space-y-0 p-4 border rounded-md hover:bg-muted/50 has-[[data-state=checked]]:bg-accent/10 has-[[data-state=checked]]:border-accent">
                              <FormControl>
                                <RadioGroupItem value="student" />
                              </FormControl>
                              <FormLabel className="font-normal text-lg cursor-pointer flex-grow flex items-center">
                                <User className="mr-3 h-6 w-6 text-primary" /> Student / Learner
                              </FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0 p-4 border rounded-md hover:bg-muted/50 has-[[data-state=checked]]:bg-accent/10 has-[[data-state=checked]]:border-accent">
                              <FormControl>
                                <RadioGroupItem value="admin" />
                              </FormControl>
                              <FormLabel className="font-normal text-lg cursor-pointer flex-grow flex items-center">
                                <Shield className="mr-3 h-6 w-6 text-primary" /> Teacher / Admin
                              </FormLabel>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full">
                    Next <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              </Form>
            </CardContent>
          </>
        )}

        {step === 2 && selectedRole && (
          <>
            <CardHeader>
              <CardTitle className="text-3xl font-headline">Register as {selectedRole === 'admin' ? 'Admin' : 'Student'}</CardTitle>
              <CardDescription>Enter your email to receive a verification OTP.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...emailForm}>
                <form onSubmit={emailForm.handleSubmit(handleEmailSubmitAndSendOtp)} className="space-y-6">
                  <FormField
                    control={emailForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="you@example.com" {...field} type="email" autoFocus />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {serverError && <p className="text-sm font-medium text-destructive">{serverError}</p>}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => { setStep(1); setServerError(null); setSelectedRole(null); }} 
                      className="w-full sm:w-auto"
                    >
                      Back to Role
                    </Button>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Send OTP
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </>
        )}
        
        {step === 3 && selectedRole && email && (
          <>
            <CardHeader>
              <CardTitle className="text-3xl font-headline">Final Step</CardTitle>
              <CardDescription>
                Enter OTP sent to <span className="font-medium">{email}</span>, and complete your details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedRole === 'student' && (
                <Form {...studentDetailsForm}>
                  <form onSubmit={studentDetailsForm.handleSubmit(handleFinalRegistration)} className="space-y-4">
                    <FormField control={studentDetailsForm.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl><Input placeholder="Your full name" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={studentDetailsForm.control} name="rollNo" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Roll Number (Optional)</FormLabel>
                        <FormControl><Input placeholder="Your roll number" {...field} value={field.value || ''}/></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 py-2">
                        <FormControl>
                            <Button type="button" variant="ghost" className="p-0 h-auto" onClick={() => setShowTeacherIdField(!showTeacherIdField)}>
                                {showTeacherIdField ? <CheckSquare className="h-5 w-5 text-primary"/> : <Square className="h-5 w-5 text-muted-foreground"/>}
                            </Button>
                        </FormControl>
                        <FormLabel onClick={() => setShowTeacherIdField(!showTeacherIdField)} className="font-normal text-sm cursor-pointer">
                            Are you registering under a Teacher/Admin? (Optional)
                        </FormLabel>
                    </FormItem>

                    {showTeacherIdField && (
                         <FormField control={studentDetailsForm.control} name="teacherId" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Teacher/Admin Unique ID</FormLabel>
                                <FormControl><Input placeholder="Enter Teacher's unique ID" {...field} value={field.value || ''} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                    )}

                    <FormField
                        control={studentDetailsForm.control}
                        name="otp"
                        render={({ field }) => (
                            <FormItem>
                            <div className="flex justify-between items-center">
                                <FormLabel>OTP</FormLabel>
                                {resendAttempts < maxResendAttempts && (
                                <Button
                                    type="button"
                                    variant="link"
                                    className="p-0 h-auto text-xs"
                                    onClick={handleResendOtp}
                                    disabled={isSubmitting || isResending || resendCooldown > 0}
                                >
                                    {isResending && <Loader2 className="mr-2 h-3 w-3 animate-spin"/>}
                                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                                </Button>
                                )}
                            </div>
                            <FormControl>
                                <Input placeholder="6-digit OTP" {...field} type="text" maxLength={6} />
                            </FormControl>
                            <FormMessage />
                             {resendAttempts >= maxResendAttempts && (
                                <p className="text-xs text-destructive text-right">Max resend attempts reached.</p>
                            )}
                            </FormItem>
                        )}
                    />
                    <FormField control={studentDetailsForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl><Input placeholder="••••••••" {...field} type="password" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField
                      control={studentDetailsForm.control}
                      name="isTwoFactorEnabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>
                              Enable Two-Factor Authentication
                            </FormLabel>
                            <FormDescription className="text-xs">
                              Secure your account with an email verification code on login.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    {serverError && <p className="text-sm font-medium text-destructive">{serverError}</p>}
                     <div className="flex flex-col sm:flex-row gap-2 pt-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => { setStep(2); setServerError(null); }} 
                          className="w-full sm:w-auto"
                        >
                          Back to Email
                        </Button>
                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Verify & Register
                        </Button>
                    </div>
                  </form>
                </Form>
              )}
              {selectedRole === 'admin' && (
                <Form {...adminDetailsForm}>
                  <form onSubmit={adminDetailsForm.handleSubmit(handleFinalRegistration)} className="space-y-6">
                     <FormField
                        control={adminDetailsForm.control}
                        name="otp"
                        render={({ field }) => (
                            <FormItem>
                            <div className="flex justify-between items-center">
                                <FormLabel>OTP</FormLabel>
                                {resendAttempts < maxResendAttempts && (
                                <Button
                                    type="button"
                                    variant="link"
                                    className="p-0 h-auto text-xs"
                                    onClick={handleResendOtp}
                                    disabled={isSubmitting || isResending || resendCooldown > 0}
                                >
                                    {isResending && <Loader2 className="mr-2 h-3 w-3 animate-spin"/>}
                                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                                </Button>
                                )}
                            </div>
                            <FormControl>
                                <Input placeholder="6-digit OTP" {...field} type="text" maxLength={6} />
                            </FormControl>
                            <FormMessage />
                            {resendAttempts >= maxResendAttempts && (
                                <p className="text-xs text-destructive text-right">Max resend attempts reached.</p>
                            )}
                            </FormItem>
                        )}
                    />
                    <FormField control={adminDetailsForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl><Input placeholder="••••••••" {...field} type="password" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField
                      control={adminDetailsForm.control}
                      name="isTwoFactorEnabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>
                              Enable Two-Factor Authentication
                            </FormLabel>
                            <FormDescription className="text-xs">
                              Secure your account with an email verification code on login.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    {serverError && <p className="text-sm font-medium text-destructive">{serverError}</p>}
                     <div className="flex flex-col sm:flex-row gap-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => { setStep(2); setServerError(null); }} 
                          className="w-full sm:w-auto"
                        >
                          Back to Email
                        </Button>
                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Verify & Register Admin
                        </Button>
                    </div>
                  </form>
                </Form>
              )}
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
