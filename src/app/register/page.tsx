
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
import { Loader2, User, Shield, ArrowRight, CheckSquare, Square } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { initiateEmailOtp, type InitiateEmailOtpOutput } from '@/ai/flows/initiate-email-otp';
import { verifyEmailOtpAndRegister, type VerifyEmailOtpAndRegisterOutput } from '@/ai/flows/verify-email-otp-and-register';
import type { UserRole } from '@/lib/models/user';

// Schemas for different steps/roles
const RoleSelectionSchema = z.object({
  role: z.enum(['student', 'admin'], { required_error: 'Please select a role.' }),
});
type RoleSelectionFormValues = z.infer<typeof RoleSelectionSchema>;

const EmailSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
});
type EmailFormValues = z.infer<typeof EmailSchema>;

const StudentDetailsSchema = z.object({
  name: z.string().min(1, 'Name is required.').max(100, 'Name is too long.'),
  rollNo: z.string().max(50, 'Roll number is too long.').optional(),
  teacherId: z.string().max(50, 'Teacher ID is too long.').optional(),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  otp: z.string().length(6, { message: 'OTP must be 6 digits.' }), // OTP needed for student final step
});
type StudentDetailsFormValues = z.infer<typeof StudentDetailsSchema>;

const AdminDetailsSchema = z.object({
  // Email is already captured
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  otp: z.string().length(6, { message: 'OTP must be 6 digits.' }), // OTP needed for admin final step
});
type AdminDetailsFormValues = z.infer<typeof AdminDetailsSchema>;


export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1); // 1: Role, 2: Email, 3: OTP (for admin/student), 4: Details + Password
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showTeacherIdField, setShowTeacherIdField] = useState(false);

  const roleForm = useForm<RoleSelectionFormValues>({ resolver: zodResolver(RoleSelectionSchema) });
  const emailForm = useForm<EmailFormValues>({ resolver: zodResolver(EmailSchema), defaultValues: { email: '' } });
  const studentDetailsForm = useForm<StudentDetailsFormValues>({ resolver: zodResolver(StudentDetailsSchema), defaultValues: { name: '', rollNo: '', teacherId: '', password: '', otp: ''} });
  const adminDetailsForm = useForm<AdminDetailsFormValues>({ resolver: zodResolver(AdminDetailsSchema), defaultValues: { password: '', otp: ''} });

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const handleRoleSelection = (values: RoleSelectionFormValues) => {
    setSelectedRole(values.role);
    setStep(2); // Move to email step
    setServerError(null);
  };

  const handleEmailSubmitAndSendOtp = async (values: EmailFormValues) => {
    setIsSubmitting(true);
    setServerError(null);
    try {
      const result: InitiateEmailOtpOutput = await initiateEmailOtp({ email: values.email });
      if (result.success) {
        toast({
          title: 'OTP Sent',
          description: result.message + (process.env.NODE_ENV === 'development' ? " Check server console for OTP." : ""),
        });
        setEmail(values.email);
        setStep(3); // Move to OTP + Details + Password step
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
  
  const handleFinalRegistration = async (values: StudentDetailsFormValues | AdminDetailsFormValues) => {
    if (!selectedRole || !email) {
      setServerError("Role or email not set. Please restart registration.");
      return;
    }
    setIsSubmitting(true);
    setServerError(null);

    const commonPayload = {
      email,
      otp: values.otp,
      password: values.password,
      role: selectedRole,
    };

    let payload;
    if (selectedRole === 'student') {
      const studentValues = values as StudentDetailsFormValues;
      payload = {
        ...commonPayload,
        name: studentValues.name,
        rollNo: studentValues.rollNo || undefined,
        adminUniqueId: studentValues.teacherId || undefined,
      };
    } else { // admin
      payload = commonPayload;
    }

    try {
      const result: VerifyEmailOtpAndRegisterOutput = await verifyEmailOtpAndRegister(payload);

      if (result.success) {
        toast({
          title: 'Registration Successful',
          description: result.message + (result.adminUniqueIdGenerated ? ` Your Admin ID: ${result.adminUniqueIdGenerated}` : ''),
          duration: result.adminUniqueIdGenerated ? 10000 : 5000,
        });
        router.push('/'); // Firebase auth state change should also trigger redirect
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
        <Link href="/" aria-label="CertIntel Home"> <AppLogo size={40} /> </Link>
      </div>
      <Card className="w-full max-w-md shadow-xl">
        {/* Step 1: Role Selection */}
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

        {/* Step 2: Email Input */}
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
                    <Button variant="outline" onClick={() => { setStep(1); setServerError(null); setSelectedRole(null); }} className="w-full sm:w-auto">
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
        
        {/* Step 3: OTP, Details & Password */}
        {step === 3 && selectedRole && email && (
          <>
            <CardHeader>
              <CardTitle className="text-3xl font-headline">Final Step</CardTitle>
              <CardDescription>
                Enter OTP sent to <span className="font-medium">{email}</span>, and complete your details.
                {process.env.NODE_ENV === 'development' && " (Check server console for OTP)."}
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
                        <FormControl><Input placeholder="Your roll number" {...field} /></FormControl>
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
                                <FormControl><Input placeholder="Enter Teacher's unique ID" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                    )}

                    <FormField control={studentDetailsForm.control} name="otp" render={({ field }) => (
                      <FormItem>
                        <FormLabel>OTP</FormLabel>
                        <FormControl><Input placeholder="6-digit OTP" {...field} type="text" maxLength={6} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={studentDetailsForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl><Input placeholder="••••••••" {...field} type="password" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {serverError && <p className="text-sm font-medium text-destructive">{serverError}</p>}
                     <div className="flex flex-col sm:flex-row gap-2 pt-2">
                        <Button variant="outline" onClick={() => { setStep(2); setServerError(null); }} className="w-full sm:w-auto">
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
                     <FormField control={adminDetailsForm.control} name="otp" render={({ field }) => (
                      <FormItem>
                        <FormLabel>OTP</FormLabel>
                        <FormControl><Input placeholder="6-digit OTP" {...field} type="text" maxLength={6} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={adminDetailsForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl><Input placeholder="••••••••" {...field} type="password" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {serverError && <p className="text-sm font-medium text-destructive">{serverError}</p>}
                     <div className="flex flex-col sm:flex-row gap-2">
                        <Button variant="outline" onClick={() => { setStep(2); setServerError(null); }} className="w-full sm:w-auto">
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
