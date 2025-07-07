
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Sparkles, ExternalLink, AlertTriangle, Info, BrainCircuit, RefreshCw, FileImage, FileWarning, Edit } from 'lucide-react';
import Link from 'next/link';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UserImage } from '@/components/home/ImageGrid';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// --- TypeScript Interfaces ---
interface LLMSuggestion {
  name: string;
  description: string;
  url: string;
}

interface UserProcessedCourseData {
  identified_course_name: string;
  description_from_graph?: string | null;
  ai_description?: string | null;
  llm_suggestions: LLMSuggestion[];
  llm_error?: string | null;
  processed_by?: string;
}

interface SuggestionsPhaseResult {
  user_processed_data?: UserProcessedCourseData[];
  llm_error_summary?: string | null;
  associated_image_file_ids?: string[];
  error?: string;
  message?: string;
  processedAt?: string;
}

interface CourseGroup {
    courseName: string;
    images: UserImage[];
}

function AiFeaturePageContent() {
  const flaskServerBaseUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL || 'http://localhost:5000';
  const { toast } = useToast();
  const { user, userId } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [allUserImages, setAllUserImages] = useState<UserImage[]>([]);
  const [suggestionsResult, setSuggestionsResult] = useState<SuggestionsPhaseResult | null>(null);
  
  const [isRefreshingCourse, setIsRefreshingCourse] = useState<string | null>(null);
  const [imageToEdit, setImageToEdit] = useState<UserImage | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // Fetch all user images (which now contain pre-extracted course names)
  useEffect(() => {
    if (!userId || !user) {
      if (!isLoading) setIsLoading(true); // Ensure loader shows if auth is lost
      return;
    }

    const fetchInitialData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const idToken = await user.getIdToken();
        const imagesResponse = await fetch(`/api/user-images?userId=${userId}`, {
          headers: { 'Authorization': `Bearer ${idToken}` }
        });

        if (!imagesResponse.ok) {
          const err = await imagesResponse.json();
          throw new Error(err.message || "Failed to fetch user's certificates.");
        }
        
        const imagesData: UserImage[] = await imagesResponse.json();
        setAllUserImages(imagesData);

      } catch (err: any) {
        setError(err.message);
        toast({ title: "Error Loading Data", description: err.message, variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, [userId, user, toast, refreshKey]);

  const courseGroups = useMemo(() => {
    const groups: { [key: string]: CourseGroup } = {};
    const unnamed: UserImage[] = [];

    allUserImages.forEach(image => {
      const key = image.courseName || 'Unnamed Certificates';
      if (image.courseName) {
        if (!groups[key]) {
          groups[key] = { courseName: key, images: [] };
        }
        groups[key].images.push(image);
      } else {
        unnamed.push(image);
      }
    });

    if (unnamed.length > 0) {
      groups['Unnamed Certificates'] = { courseName: 'Unnamed Certificates', images: unnamed };
    }

    return Object.values(groups).sort((a,b) => a.courseName.localeCompare(b.courseName));
  }, [allUserImages]);
  
  const allKnownCourses = useMemo(() => {
      return [...new Set(allUserImages.map(img => img.courseName).filter(Boolean) as string[])];
  }, [allUserImages]);

  const handleGetSuggestions = useCallback(async (coursesToFetch: string[], forceRefreshList: string[] = []) => {
    if (!userId) return;
    setIsGenerating(true);
    if(forceRefreshList.length === 0) setIsRefreshingCourse(null);
    setError(null);

    if (coursesToFetch.length === 0) {
      toast({ title: 'No Courses', description: 'No extracted course names available to get suggestions for.', variant: 'destructive' });
      setIsGenerating(false);
      return;
    }

    try {
      const endpoint = `${flaskServerBaseUrl}/api/process-certificates`;
      const payload: any = {
        userId,
        mode: 'suggestions_only',
        knownCourseNames: coursesToFetch,
        associated_image_file_ids_from_previous_run: allUserImages.map(img => img.fileId)
      };
      if (forceRefreshList.length > 0) {
        payload.forceRefreshForCourses = forceRefreshList;
      }
      
      const response = await fetch(endpoint, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }, 
        body: JSON.stringify(payload),
      });
      const data: SuggestionsPhaseResult = await response.json();

      if (!response.ok || data.error) throw new Error(data.error || `Server error: ${response.status}`);
      
      setSuggestionsResult(data);
      toast({ title: 'Suggestions Generated', description: `AI insights are ready for ${coursesToFetch.length} course(s).` });
      
      if (data.llm_error_summary) {
        toast({ title: "LLM Warning", description: data.llm_error_summary, variant: "destructive", duration: 7000 });
      }

    } catch (err: any) {
      setError(err.message || 'Failed to generate suggestions.');
      toast({ title: 'Suggestion Generation Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
      setIsRefreshingCourse(null);
    }
  }, [userId, flaskServerBaseUrl, toast, allUserImages]);
  
  const handleUpdateCourseName = async () => {
    if (!imageToEdit || !newName.trim() || !userId) return;

    setIsUpdatingName(true);
    try {
      const res = await fetch(`${flaskServerBaseUrl}/api/manual-course-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ userId, fileId: imageToEdit.fileId, courseName: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save manual name");

      toast({ title: "Course Name Saved", description: "The course name has been updated." });
      triggerRefresh();
      setIsEditModalOpen(false);
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUpdatingName(false);
    }
  };
  
  const openEditModal = (image: UserImage) => {
    setImageToEdit(image);
    setNewName(image.courseName || '');
    setIsEditModalOpen(true);
  };


  return (
    <TooltipProvider>
      <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8 flex flex-col">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon" aria-label="Go back to Home">
              <Link href="/"><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
            <h1 className="text-2xl sm:text-3xl font-bold font-headline">AI Insights &amp; Recommendations</h1>
          </div>
        </div>
        
        {isLoading && (
            <div className="flex flex-col items-center justify-center text-center py-10">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
                <p className="text-muted-foreground">Loading your certificates...</p>
            </div>
        )}

        {!isLoading && error && (
            <Card className="mb-6 border-destructive bg-destructive/10">
                <CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-5 w-5" /> Error Encountered</CardTitle></CardHeader>
                <CardContent><p>{error}</p></CardContent>
            </Card>
        )}

        {!isLoading && !error && (
          <>
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Your Extracted Courses</CardTitle>
                <CardDescription>
                  These courses were automatically extracted when you uploaded your certificates.
                  You can now generate AI-powered descriptions and career suggestions based on them.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {allKnownCourses.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {allKnownCourses.map(name => (
                            <span key={name} className="px-3 py-1 text-sm bg-primary/10 text-primary-foreground rounded-full border border-primary/20">{name}</span>
                        ))}
                    </div>
                ) : (
                    <p className="text-muted-foreground italic">No course names have been extracted yet. Upload some certificates to get started.</p>
                )}
              </CardContent>
              <CardFooter>
                 <Button onClick={() => handleGetSuggestions(allKnownCourses)} disabled={isGenerating || allKnownCourses.length === 0}>
                   {isGenerating && !isRefreshingCourse ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <BrainCircuit className="mr-2 h-5 w-5" />}
                   Generate AI Suggestions
                 </Button>
              </CardFooter>
            </Card>

            {suggestionsResult?.user_processed_data && (
              <div className="space-y-6">
                 {suggestionsResult.user_processed_data.map((courseData) => (
                    <Card key={courseData.identified_course_name}>
                        <CardHeader>
                            <div className="flex justify-between items-start gap-4">
                                <CardTitle className="text-xl font-headline text-primary">{courseData.identified_course_name}</CardTitle>
                                <Button variant="outline" size="sm" onClick={() => handleGetSuggestions([courseData.identified_course_name], [courseData.identified_course_name])} disabled={isGenerating}>
                                    {isGenerating && isRefreshingCourse === courseData.identified_course_name ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>}
                                    Refresh
                                </Button>
                            </div>
                            {courseData.ai_description && <CardDescription className="pt-2">{courseData.ai_description}</CardDescription>}
                        </CardHeader>
                        <CardContent>
                            <h4 className="font-semibold text-md mb-2">AI Suggested Next Steps:</h4>
                            {courseData.llm_suggestions && courseData.llm_suggestions.length > 0 ? (
                                <ul className="space-y-3 list-none pl-0">
                                  {courseData.llm_suggestions.map((suggestion, idx) => (
                                    <li key={idx} className="border p-3 rounded-md bg-card shadow-sm">
                                      <p className="font-medium">{suggestion.name}</p>
                                      <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">{suggestion.description}</p>
                                      {suggestion.url && (<Button variant="link" size="sm" asChild className="px-0 h-auto text-primary hover:text-primary/80"><a href={suggestion.url} target="_blank" rel="noopener noreferrer">Learn more <ExternalLink className="ml-1 h-3 w-3" /></a></Button>)}
                                    </li>
                                  ))}
                                </ul>
                            ) : (<p className="text-sm text-muted-foreground italic">No specific AI suggestions available.</p>)}
                        </CardContent>
                    </Card>
                 ))}
              </div>
            )}
            
            <div className="mt-12 space-y-6">
                <h2 className="text-2xl font-bold font-headline border-b pb-2">Certificate-to-Course Mapping</h2>
                <p className="text-muted-foreground">Review or correct the course name extracted for each certificate.</p>
                {courseGroups.map(group => (
                    <Card key={group.courseName}>
                        <CardHeader>
                            <CardTitle className="text-lg">{group.courseName}</CardTitle>
                            <CardDescription>
                                {group.images.length} certificate(s) mapped to this course.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {group.images.map(image => (
                                <div key={image.fileId} className="relative group">
                                    <div className="aspect-square relative rounded-md overflow-hidden border shadow-sm">
                                        <FileImage className="w-full h-full object-contain p-4 text-muted-foreground/50" />
                                    </div>
                                    <Button size="icon" variant="secondary" className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEditModal(image)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <p className="text-xs text-center mt-1 truncate" title={image.originalName}>{image.originalName}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                ))}
            </div>

          </>
        )}
      </div>

       {isEditModalOpen && imageToEdit && (
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Extracted Course Name</DialogTitle>
                    <DialogDescription>
                       Update the course name for &quot;{imageToEdit.originalName}&quot;. This will affect future AI suggestions.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2">
                    <Label htmlFor="newName">Course Name</Label>
                    <Input
                        id="newName"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Enter correct course name"
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditModalOpen(false)} disabled={isUpdatingName}>Cancel</Button>
                    <Button onClick={handleUpdateCourseName} disabled={isUpdatingName || !newName.trim()}>
                        {isUpdatingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Name
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}

    </TooltipProvider>
  );
}

export default function AiFeaturePage() {
  return (
    <ProtectedPage>
      <AiFeaturePageContent />
    </ProtectedPage>
  );
}
