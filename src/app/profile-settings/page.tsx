
'use client';

import { useState, useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save, KeyRound, UserCircle, Copy } from 'lucide-react';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { sendPasswordReset, updateUserProfileName } from '@/lib/firebase/auth';
import { updateUserProfileDocument } from '@/lib/services/userService'; // Assuming you'll add this
import type { UserProfile } from '@/lib/models/user';

const profileFormSchema = z.object({
  displayName: z.string().min(1, 'Display name cannot be empty.').max(50, 'Display name is too long.'),
  rollNo: z.string().max(50, "Roll number is too long").optional(),
});
type ProfileFormValues = z.infer<typeof profileFormSchema>;

function ProfileSettingsPageContent() {
  const { user, userProfile, loading: authLoading } = useAuth(); // Get userProfile
  const { toast } = useToast();

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(''); // Still local state, not saved to DB via this form

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: '',
      rollNo: '',
    },
  });
  
  useEffect(() => {
    if (userProfile) {
      profileForm.reset({ 
        displayName: userProfile.displayName || user?.email?.split('@')[0] || '',
        rollNo: userProfile.rollNo || '',
      });
    } else if (user && !userProfile && !authLoading) { // User exists, but profile might still be loading or null
        profileForm.reset({ displayName: user.email?.split('@')[0] || '' });
    }
  }, [user, userProfile, profileForm, authLoading]);

  const handleProfileUpdate: SubmitHandler<ProfileFormValues> = async (data) => {
    if (!user) return;
    setIsSavingProfile(true);

    // Update Firebase Auth display name (optional, if you use it directly)
    await updateUserProfileName(data.displayName); 

    // Update Firestore profile document
    const updatedProfileData: Partial<UserProfile> = { 
        displayName: data.displayName,
        updatedAt: new Date() as any, // Temp cast, userService should handle Timestamps
    };
    if (userProfile?.role === 'student') {
        updatedProfileData.rollNo = data.rollNo;
    }

    // You'll need an updateUserProfileDocument function in userService.ts
    // For now, this is a conceptual call
    // const firestoreResult = await updateUserProfileDocument(user.uid, updatedProfileData);
    // For this example, we'll mock success as that function isn't defined yet.
    const firestoreResult = { success: true, message: "Profile updated in Firestore (mocked)." };


    if (firestoreResult.success) {
      toast({ title: 'Profile Updated', description: 'Your profile details have been updated.' });
      // Optionally re-fetch userProfile in AuthContext or merge changes locally
    } else {
      toast({ title: 'Update Failed', description: firestoreResult.message || "Could not update profile in Firestore.", variant: 'destructive' });
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

  const copyAdminId = () => {
    if (userProfile?.adminUniqueId) {
      navigator.clipboard.writeText(userProfile.adminUniqueId)
        .then(() => toast({ title: 'Admin ID Copied!', description: 'Your unique Admin ID has been copied to the clipboard.'}))
        .catch(() => toast({ title: 'Copy Failed', description: 'Could not copy Admin ID.', variant: 'destructive'}));
    }
  };

  if (authLoading || (!user && !authLoading)) { // Show loader if loading or if not logged in (ProtectedPage will redirect)
    return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // If user is loaded, but profile is still loading or hasn't been set (brief moment)
  if (user && !userProfile && authLoading) {
     return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4">Loading profile...</p>
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
            <CardDescription>Manage your personal details. Your role is: <span className="font-semibold">{userProfile?.role || 'Loading...'}</span></CardDescription>
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
                {userProfile?.role === 'student' && (
                    <FormField
                    control={profileForm.control}
                    name="rollNo"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Roll Number</FormLabel>
                        <FormControl>
                            <Input placeholder="Your Roll Number" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                )}
                 <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" value={user?.email || ''} readOnly disabled className="cursor-not-allowed" />
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
                {userProfile?.role === 'admin' && userProfile.adminUniqueId && (
                  <div className="space-y-2">
                    <Label htmlFor="adminId">Your Unique Admin ID (Share with students)</Label>
                    <div className="flex items-center gap-2">
                      <Input id="adminId" type="text" value={userProfile.adminUniqueId} readOnly className="bg-muted/50" />
                      <Button type="button" variant="outline" size="icon" onClick={copyAdminId} title="Copy Admin ID">
                        <Copy className="h-4 w-4"/>
                      </Button>
                    </div>
                  </div>
                )}

                <Button type="submit" disabled={isSavingProfile || !profileForm.formState.isDirty}>
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
