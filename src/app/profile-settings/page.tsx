
'use client';

import { useState, useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save, KeyRound, UserCircle } from 'lucide-react'; // Removed Palette

import ProtectedPage from '@/components/auth/ProtectedPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// import { Switch } from '@/components/ui/switch'; // Removed Switch
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
// import { Separator } from '@/components/ui/separator'; // Removed Separator if only used before theme
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { sendPasswordReset, updateUserProfileName } from '@/lib/firebase/auth';
// import { useTheme } from '@/hooks/themeContextManager'; // Removed useTheme

const profileFormSchema = z.object({
  displayName: z.string().min(1, 'Display name cannot be empty.').max(50, 'Display name is too long.'),
});
type ProfileFormValues = z.infer<typeof profileFormSchema>;

function ProfileSettingsPageContent() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  // const { theme, toggleTheme } = useTheme(); // Removed theme usage

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  // const [mounted, setMounted] = useState(false); // Removed mounted state, not needed without theme toggle

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: '',
    },
  });
  
  // useEffect(() => { // Removed useEffect for mounted state
  //   setMounted(true);
  // }, []);

  useEffect(() => {
    if (user) {
      profileForm.reset({ displayName: user.displayName || user.email?.split('@')[0] || '' });
    }
  }, [user, profileForm]);

  const handleProfileUpdate: SubmitHandler<ProfileFormValues> = async (data) => {
    setIsSavingProfile(true);
    const result = await updateUserProfileName(data.displayName);
    if (result.success) {
      toast({ title: 'Profile Updated', description: 'Your display name has been updated.' });
    } else {
      toast({ title: 'Update Failed', description: result.message, variant: 'destructive' });
    }
    setIsSavingProfile(false);
  };

  const handlePasswordReset = async () => {
    if (!user?.email) {
      toast({ title: 'Error', description: 'No email address found for password reset.', variant: 'destructive' });
      return;
    }
    setIsSendingReset(true);
    const result = await sendPasswordReset(user.email);
    toast({
      title: result.success ? 'Password Reset Email Sent' : 'Request Failed',
      description: result.message,
      variant: result.success ? 'default' : 'destructive',
      duration: 7000,
    });
    setIsSendingReset(false);
  };

  // Removed `|| !mounted` from condition
  if (authLoading || !user) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8 max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="outline" size="icon" aria-label="Go back to Home">
          <Link href="/"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <h1 className="text-3xl font-bold font-headline">Profile & Settings</h1>
      </div>

      <div className="space-y-8">
        <Card id="personal-information">
          <CardHeader>
            <CardTitle className="text-xl font-headline flex items-center"><UserCircle className="mr-2" /> Personal Information</CardTitle>
            <CardDescription>Manage your personal details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(handleProfileUpdate)} className="space-y-4">
                <FormField
                  control={profileForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your Name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" value={user.email || ''} readOnly disabled className="cursor-not-allowed" />
                  <p className="text-xs text-muted-foreground">Email address cannot be changed.</p>
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone Number (Optional)</Label>
                  <Input 
                    id="phoneNumber" 
                    type="tel" 
                    placeholder="e.g., +1 555-123-4567" 
                    value={phoneNumber} 
                    onChange={(e) => setPhoneNumber(e.target.value)} 
                  />
                  <p className="text-xs text-muted-foreground">
                    Phone number is for display and contact purposes. Currently not saved to database.
                  </p>
                </div>
                <Button type="submit" disabled={isSavingProfile}>
                  {isSavingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Profile Changes
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card id="account-settings">
          <CardHeader>
            <CardTitle className="text-xl font-headline flex items-center"><KeyRound className="mr-2" /> Account Settings</CardTitle>
            <CardDescription>Manage your account security.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-medium mb-2">Password Reset</h3>
              <p className="text-sm text-muted-foreground mb-3">
                If you wish to change your password, click the button below to send a password reset link to your email address.
              </p>
              <Button variant="outline" onClick={handlePasswordReset} disabled={isSendingReset}>
                {isSendingReset ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Send Password Reset Email
              </Button>
            </div>
            {/* Removed Theme Preference Section and Separator */}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ProfileSettingsPage() {
  return (
    <ProtectedPage>
      <ProfileSettingsPageContent />
    </ProtectedPage>
  );
}
