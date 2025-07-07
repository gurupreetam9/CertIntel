
'use client';

import { useState, useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save, KeyRound, UserCircle, Copy, Link2, Link2Off, AlertTriangle, Trash2, Globe } from 'lucide-react';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { sendPasswordReset, updateUserProfileName } from '@/lib/firebase/auth';
import { 
  updateUserProfileDocument, 
  studentRequestLinkWithAdmin,
  studentRemoveAdminLink,
  getAdminByUniqueId, 
} from '@/lib/services/userService';
import type { UserProfile } from '@/lib/models/user';
import { doc, getDoc } from 'firebase/firestore';
import { firestore, auth as firebaseAuth } from '@/lib/firebase/config'; // Import firebaseAuth for direct SDK access
import { initiateAccountDeletion } from '@/ai/flows/initiate-account-deletion';
import { Switch } from '@/components/ui/switch';


const profileFormSchema = z.object({
  displayName: z.string().min(1, 'Display name cannot be empty.').max(50, 'Display name is too long.'),
  rollNo: z.string().max(50, "Roll number is too long").optional(),
});
type ProfileFormValues = z.infer<typeof profileFormSchema>;

const adminLinkSchema = z.object({
  newAdminId: z.string().min(1, "Admin ID cannot be empty.").max(50, "Admin ID is too long."),
});
type AdminLinkFormValues = z.infer<typeof adminLinkSchema>;

function ProfileSettingsPageContent() {
  const { user, userProfile, loading: authLoading, refreshUserProfile } = useAuth();
  const { toast } = useToast();

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(''); 
  
  const [isSubmittingLinkRequest, setIsSubmittingLinkRequest] = useState(false);
  const [isRemovingLink, setIsRemovingLink] = useState(false);
  const [linkedAdminName, setLinkedAdminName] = useState<string | null>(null);
  
  const [isUpdatingPublicProfile, setIsUpdatingPublicProfile] = useState(false);
  const publicProfileUrl = user ? `${process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')}/profile/${user.uid}` : '';


  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: '',
      rollNo: '',
    },
  });

  const adminLinkForm = useForm<AdminLinkFormValues>({
    resolver: zodResolver(adminLinkSchema),
    defaultValues: { newAdminId: '' },
  });
  
  useEffect(() => {
    if (userProfile) {
      profileForm.reset({ 
        displayName: userProfile.displayName || user?.email?.split('@')[0] || '',
        rollNo: userProfile.rollNo || '',
      });
      if (userProfile.role === 'student' && userProfile.associatedAdminUniqueId && userProfile.linkRequestStatus === 'accepted') {
        getAdminByUniqueId(userProfile.associatedAdminUniqueId).then(admin => {
          if (admin && admin.userId) { 
             const adminDocRef = doc(firestore, 'users', admin.userId);
             getDoc(adminDocRef).then(adminUserDoc => {
                if(adminUserDoc.exists()) {
                    const adminUserData = adminUserDoc.data() as UserProfile;
                    setLinkedAdminName(adminUserData.displayName || admin.email || admin.adminUniqueId);
                } else {
                     setLinkedAdminName(admin.email || admin.adminUniqueId); 
                }
             }).catch(() => setLinkedAdminName(admin.email || admin.adminUniqueId)); 
          } else if (admin) {
            setLinkedAdminName(admin.email || admin.adminUniqueId); 
          }
        });
      } else {
        setLinkedAdminName(null);
      }
    } else if (user && !userProfile && !authLoading) {
        profileForm.reset({ displayName: user.email?.split('@')[0] || '' });
    }
  }, [user, userProfile, profileForm, authLoading]);

  const handleProfileUpdate: SubmitHandler<ProfileFormValues> = async (data) => {
    if (!user) return;
    setIsSavingProfile(true);

    await updateUserProfileName(data.displayName); 

    const updatedProfileData: Partial<UserProfile> = { 
        displayName: data.displayName,
    };
    if (userProfile?.role === 'student') {
        updatedProfileData.rollNo = data.rollNo;
    }
    
    const firestoreResult = await updateUserProfileDocument(user.uid, updatedProfileData);

    if (firestoreResult.success) {
      toast({ title: 'Profile Updated', description: 'Your profile details have been updated.' });
      refreshUserProfile();
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

  const handleInitiateDeletion = async () => {
    if (!user?.email || !user.uid) {
        toast({ title: 'Error', description: 'Cannot initiate deletion without a valid user session.', variant: 'destructive' });
        return;
    }
    setIsDeleting(true);
    try {
        const baseUrl = window.location.origin;
        const result = await initiateAccountDeletion({ email: user.email, userId: user.uid, baseUrl });
        if (result.success) {
            toast({
                title: 'Deletion Email Sent',
                description: result.message,
                duration: 10000,
            });
        } else {
            toast({
                title: 'Request Failed',
                description: result.message,
                variant: 'destructive',
            });
        }
    } catch (error: any) {
        toast({
            title: 'Error',
            description: error.message || 'An unexpected error occurred.',
            variant: 'destructive',
        });
    } finally {
        setIsDeleting(false);
    }
  };


  const copyAdminId = () => {
    if (userProfile?.adminUniqueId) {
      navigator.clipboard.writeText(userProfile.adminUniqueId)
        .then(() => toast({ title: 'Admin ID Copied!', description: 'Your unique Admin ID has been copied to the clipboard.'}))
        .catch(() => toast({ title: 'Copy Failed', description: 'Could not copy Admin ID.', variant: 'destructive'}));
    }
  };

  const handleRequestLink: SubmitHandler<AdminLinkFormValues> = async (data) => {
    // ===== VERY IMPORTANT LOGGING - CHECK BROWSER CONSOLE =====
    console.log("%c[CLIENT] ProfileSettingsPage: handleRequestLink - Function ENTRY. Button Clicked.", "color: blue; font-weight: bold; font-size: 1.2em;");
    console.log("[CLIENT] ProfileSettingsPage: handleRequestLink - Form data submitted:", JSON.parse(JSON.stringify(data)));

    const sdkCurrentUser = firebaseAuth.currentUser; // Direct check of Firebase SDK's current user
    const sdkCurrentUID = sdkCurrentUser?.uid;
    const sdkCurrentUserEmail = sdkCurrentUser?.email;

    // Log state from useAuth() hook (which comes from AuthContext)
    console.log(`[CLIENT] ProfileSettingsPage: handleRequestLink - Context User (useAuth): UID=${user?.uid}, Email=${user?.email}`);
    console.log("[CLIENT] ProfileSettingsPage: handleRequestLink - Context UserProfile (useAuth):", userProfile ? JSON.parse(JSON.stringify(userProfile)) : "null/undefined");
    
    // Log state directly from Firebase SDK
    console.log(`[CLIENT] ProfileSettingsPage: handleRequestLink - Firebase SDK State: UID=${sdkCurrentUID}, Email=${sdkCurrentUserEmail}`);
    
    if (!user || !user.uid || !user.email || !userProfile) {
      const errorMsg = `Pre-flight check failed. Context State: user.uid=${user?.uid}, user.email=${user?.email}, userProfile_exists=${!!userProfile}. SDK State: sdkCurrentUID=${sdkCurrentUID}. Please re-login.`;
      toast({ 
        title: "Authentication Error (Pre-flight)", 
        description: errorMsg, 
        variant: "destructive",
        duration: 10000 
      });
      console.error(`[CLIENT] ProfileSettingsPage: handleRequestLink - PRE-FLIGHT CHECK FAILED. ${errorMsg}`);
      setIsSubmittingLinkRequest(false);
      return;
    }
    
    console.log(`[CLIENT] ProfileSettingsPage: handleRequestLink - PRE-FLIGHT CHECK PASSED. Proceeding with link request. Student UID (from context): ${user.uid}, Role: ${userProfile.role}`);

    if (userProfile.role !== 'student') {
      toast({ title: "Invalid Action", description: "Only students can link with an admin.", variant: "destructive" });
      console.warn(`[CLIENT] ProfileSettingsPage: handleRequestLink - Invalid action: User role is '${userProfile.role}', not 'student'.`);
      setIsSubmittingLinkRequest(false);
      return;
    }

    setIsSubmittingLinkRequest(true);
    try {
      // Ensure studentUserId passed to the service is from the authenticated user context (user.uid)
      const result = await studentRequestLinkWithAdmin(
        user.uid, 
        user.email,
        userProfile.displayName || user.email.split('@')[0] || 'Student', 
        userProfile.rollNo || null,
        data.newAdminId
      );

      console.log(`[CLIENT] ProfileSettingsPage: handleRequestLink - studentRequestLinkWithAdmin service call result:`, result);

      if (result.success) {
        toast({ title: "Link Request Sent", description: `Request to link with Admin ID ${data.newAdminId} has been sent.` });
        adminLinkForm.reset();
        refreshUserProfile(); 
      } else {
        toast({ title: "Link Request Failed", description: result.message, variant: "destructive", duration: 7000 });
      }
    } catch (error: any) {
      console.error("[CLIENT] ProfileSettingsPage: handleRequestLink - CATCH BLOCK - Error during link request process:", error);
      toast({ title: "Error", description: error.message || "An unexpected error occurred while requesting link.", variant: "destructive" });
    } finally {
      setIsSubmittingLinkRequest(false);
    }
  };

  const handleRemoveLink = async () => {
    console.log("%c[CLIENT] ProfileSettingsPage: handleRemoveLink - Function ENTRY.", "color: red; font-weight: bold; font-size: 1.2em;");
    const sdkCurrentUser = firebaseAuth.currentUser;
    console.log(`[CLIENT] ProfileSettingsPage: handleRemoveLink - Context User UID: ${user?.uid}, SDK User UID: ${sdkCurrentUser?.uid}`);
    console.log("[CLIENT] ProfileSettingsPage: handleRemoveLink - Context UserProfile:", userProfile ? JSON.parse(JSON.stringify(userProfile)) : "null/undefined");
    
    if (!user || !user.uid || !userProfile || userProfile.role !== 'student') {
        const errorMsg = `Pre-condition FAILED for remove link. Context: user.uid=${user?.uid}, userProfile_exists=${!!userProfile}, role=${userProfile?.role}. SDK UID=${sdkCurrentUser?.uid}.`;
        toast({ title: "Error (Pre-condition)", description: errorMsg, variant: "destructive" });
        console.error(`[CLIENT] ProfileSettingsPage: handleRemoveLink - ${errorMsg}`);
        return;
    }

    setIsRemovingLink(true);
    try {
      const result = await studentRemoveAdminLink(user.uid); // Pass authenticated user's UID
      console.log(`[CLIENT] ProfileSettingsPage: handleRemoveLink - studentRemoveAdminLink service call result:`, result);
      if (result.success) {
        toast({ title: "Link Removed", description: "You are no longer linked with the admin." });
        refreshUserProfile();
      } else {
        toast({ title: "Failed to Remove Link", description: result.message, variant: "destructive" });
      }
    } catch (error: any) {
      console.error("[CLIENT] ProfileSettingsPage: handleRemoveLink - CATCH BLOCK - Error removing link:", error);
      toast({ title: "Error", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsRemovingLink(false);
    }
  };

  const handleTogglePublicProfile = async (isEnabled: boolean) => {
    if (!user) return;
    setIsUpdatingPublicProfile(true);

    const result = await updateUserProfileDocument(user.uid, { isPublicProfileEnabled: isEnabled });

    if (result.success) {
      toast({ title: 'Public Profile Updated', description: `Your showcase profile is now ${isEnabled ? 'enabled' : 'disabled'}.` });
      refreshUserProfile();
    } else {
      toast({ title: 'Update Failed', description: result.message || "Could not update public profile setting.", variant: 'destructive' });
    }
    setIsUpdatingPublicProfile(false);
  };


  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (user && !userProfile && authLoading) {
     return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4">Loading profile...</p>
      </div>
    );
  }

  const canRequestNewLink = userProfile?.role === 'student' && 
                            (!userProfile.associatedAdminUniqueId || 
                             userProfile.linkRequestStatus === 'none' || 
                             userProfile.linkRequestStatus === 'rejected');
  
  const isLinkPending = userProfile?.role === 'student' && userProfile.linkRequestStatus === 'pending';
  const isLinkAccepted = userProfile?.role === 'student' && userProfile.linkRequestStatus === 'accepted' && userProfile.associatedAdminUniqueId;


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
                        <FormLabel>Roll Number (Optional)</FormLabel>
                        <FormControl>
                            <Input placeholder="Your Roll Number" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                )}
                 <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" value={user?.email || ''} readOnly disabled className="cursor-not-allowed bg-muted/50" />
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

        {userProfile?.role === 'student' && (
          <Card id="teacher-link-management">
            <CardHeader>
              <CardTitle className="text-xl font-headline flex items-center">
                <Link2 className="mr-2" /> Teacher/Admin Link
              </CardTitle>
              <CardDescription>Manage your connection with a teacher or administrator.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLinkAccepted && userProfile.associatedAdminUniqueId && (
                <div className="space-y-3 p-4 border rounded-md bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-700">
                  <p className="text-sm text-green-700 dark:text-green-300">
                    You are currently linked with Teacher/Admin: <strong className="font-semibold">{linkedAdminName || userProfile.associatedAdminUniqueId}</strong>.
                  </p>
                  <Button variant="destructive" onClick={handleRemoveLink} disabled={isRemovingLink}>
                    {isRemovingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2Off className="mr-2 h-4 w-4" />}
                    Remove Link
                  </Button>
                </div>
              )}

              {isLinkPending && userProfile.associatedAdminUniqueId && (
                <div className="space-y-3 p-4 border rounded-md bg-yellow-50 border-yellow-200 dark:bg-yellow-800/30 dark:border-yellow-700">
                  <div className="flex items-start gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-yellow-700 dark:text-yellow-300 mt-0.5 shrink-0" />
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      Your request to link with Teacher/Admin ID <strong className="font-semibold">{userProfile.associatedAdminUniqueId}</strong> is pending approval.
                    </p>
                  </div>
                   <Button variant="outline" onClick={handleRemoveLink} disabled={isRemovingLink || isSubmittingLinkRequest} size="sm" className="ml-[20px]">
                    {isRemovingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2Off className="mr-2 h-4 w-4" />}
                    Cancel Request
                  </Button>
                </div>
              )}
              
              {userProfile.linkRequestStatus === 'rejected' && userProfile.associatedAdminUniqueId && (
                <div className="space-y-2 p-4 border rounded-md bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-700">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-700 dark:text-red-300 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-300">
                      Your previous link request with Teacher/Admin ID <strong className="font-semibold">{userProfile.associatedAdminUniqueId}</strong> was not approved. You can try requesting again or with a different ID.
                    </p>
                  </div>
                </div>
              )}


              {canRequestNewLink && (
                <Form {...adminLinkForm}>
                  <form onSubmit={adminLinkForm.handleSubmit(handleRequestLink)} className="space-y-4">
                    <FormField
                      control={adminLinkForm.control}
                      name="newAdminId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Enter Teacher/Admin Unique ID to Link</FormLabel>
                          <FormControl>
                            <Input placeholder="Teacher's Unique ID" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={isSubmittingLinkRequest}>
                      {isSubmittingLinkRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                      Request Link with Teacher
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        )}

        {userProfile?.role === 'student' && (
          <Card id="public-profile">
            <CardHeader>
              <CardTitle className="text-xl font-headline flex items-center"><Globe className="mr-2" /> Public Showcase Profile</CardTitle>
              <CardDescription>Create a public URL to showcase your public certificates to others.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-md bg-background hover:bg-muted/50 transition-colors">
                <Label htmlFor="public-profile-switch" className="flex flex-col gap-1 cursor-pointer">
                  <span>Enable Public Profile</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Allows anyone with the link to see your public certificates.
                  </span>
                </Label>
                <Switch
                  id="public-profile-switch"
                  checked={!!userProfile.isPublicProfileEnabled}
                  onCheckedChange={handleTogglePublicProfile}
                  disabled={isUpdatingPublicProfile}
                  aria-label="Toggle public profile"
                />
              </div>
              {userProfile.isPublicProfileEnabled && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="public-url">Your Public Profile URL</Label>
                  <div className="flex items-center gap-2">
                    <Input id="public-url" type="text" value={publicProfileUrl} readOnly className="bg-muted/50" />
                    <Button type="button" variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(publicProfileUrl).then(() => toast({ title: 'URL Copied!' }))} title="Copy URL">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}


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
        
        <Card id="delete-account" className="border-destructive">
            <CardHeader>
                <CardTitle className="text-xl font-headline flex items-center text-destructive"><Trash2 className="mr-2" /> Delete Account</CardTitle>
                <CardDescription className="text-destructive/90">Permanently delete your account and all associated data.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                    Once you request account deletion, we will send a confirmation link to your email address. This link is valid for 15 minutes.
                    <br/>
                    <strong className="font-semibold">This action is irreversible.</strong> All of your certificates and personal data will be permanently removed.
                </p>
                <Button variant="destructive" onClick={handleInitiateDeletion} disabled={isDeleting}>
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Request Account Deletion
                </Button>
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
