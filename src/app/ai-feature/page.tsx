
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Sparkles, ExternalLink, AlertTriangle, Info, BrainCircuit, RefreshCw, FileText, FileWarning, Edit, X } from 'lucide-react';
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
import Image from 'next/image';

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
  const [error, setError] = useState<string | null>(null);

  const [allUserImages, setAllUserImages] = useState<UserImage[]>([]);
  const [suggestionsResult, setSuggestionsResult] = useState<SuggestionsPhaseResult | null>(null);
  
  const [imageToEdit, setImageToEdit] = useState<UserImage | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // New states for manual course entry
  const [manualCourses, setManualCourses] = useState<string[]>([]);
  const [manualCourseInput, setManualCourseInput] = useState('');
  const [isAddingManualCourse, setIsAddingManualCourse] = useState(false);
  const [isDeletingManualCourse, setIsDeletingManualCourse] = useState<string | null>(null);

  // New state for generation buttons
  const [generatingAction, setGeneratingAction] = useState<string | null>(null); // 'all', 'new', or course name


  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const fetchInitialData = useCallback(async () => {
    if (!userId || !user) {
      if (!isLoading) setIsLoading(true);
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      const idToken = await user.getIdToken();
      const imagesPromise = fetch(`/api/user-images?userId=${userId}`, {
          headers: { 'Authorization': `Bearer ${idToken}` }
      });
      
      const suggestionsPromise = fetch(`${flaskServerBaseUrl}/api/latest-processed-results?userId=${userId}`, {
          headers: { 'ngrok-skip-browser-warning': 'true' }
      });

      const manualCoursesPromise = fetch(`${flaskServerBaseUrl}/api/manual-courses?userId=${userId}`, {
          headers: { 'ngrok-skip-browser-warning': 'true' }
      });

      const [imagesResponse, suggestionsResponse, manualCoursesResponse] = await Promise.all([imagesPromise, suggestionsPromise, manualCoursesPromise]);

      // Handle images
      if (!imagesResponse.ok) {
          const err = await imagesResponse.json().catch(() => ({ message: "Failed to fetch user's certificates." }));
          throw new Error(err.message);
      }
      const imagesData: UserImage[] = await imagesResponse.json();
      setAllUserImages(imagesData);

      // Handle suggestions
      if (suggestionsResponse.ok) {
          const suggestionsData: SuggestionsPhaseResult = await suggestionsResponse.json();
          setSuggestionsResult(suggestionsData);
          toast({ title: "Latest AI Suggestions Loaded", description: "Your previously generated insights are ready.", duration: 3000 });
      } else {
        if (suggestionsResponse.status !== 404) {
            console.warn(`Could not fetch latest suggestions, status: ${suggestionsResponse.status}`);
        }
        setSuggestionsResult(null);
      }

      // Handle manual courses
      if (manualCoursesResponse.ok) {
          const manualCoursesData = await manualCoursesResponse.json();
          setManualCourses(manualCoursesData);
      } else {
          console.warn('Could not fetch manual courses.');
      }

    } catch (err: any) {
      setError(err.message);
      toast({ title: "Error Loading Page Data", description: err.message, variant: 'destructive' });
      setSuggestionsResult(null);
      setManualCourses([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId, user, flaskServerBaseUrl, toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData, refreshKey]);

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
      const coursesFromCerts = allUserImages.map(img => img.courseName).filter(Boolean) as string[];
      const combined = [...new Set([...coursesFromCerts, ...manualCourses])];
      return combined;
  }, [allUserImages, manualCourses]);

  const processedCourseNames = useMemo(() => {
    if (!suggestionsResult?.user_processed_data) {
        return new Set<string>();
    }
    return new Set(suggestionsResult.user_processed_data.map(d => d.identified_course_name));
  }, [suggestionsResult]);

  const newCourses = useMemo(() => {
    return allKnownCourses.filter(course => !processedCourseNames.has(course));
  }, [allKnownCourses, processedCourseNames]);

  const handleGetSuggestions = useCallback(async (coursesToFetch: string[], forceRefreshList: string[] = [], actionIdentifier: string) => {
    if (!userId) return;
    setGeneratingAction(actionIdentifier);
    setError(null);

    if (coursesToFetch.length === 0) {
      toast({ title: 'No Courses', description: 'No course names available to get suggestions for.', variant: 'destructive' });
      setGeneratingAction(null);
      return;
    }

    try {
      const endpoint = `${flaskServerBaseUrl}/api/process-certificates`;
      // Always send the full list of known courses so the backend can return a complete, merged result
      const payload: any = {
        userId,
        mode: 'suggestions_only',
        knownCourseNames: allKnownCourses, 
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
      toast({ title: 'Suggestions Generated', description: `AI insights are ready for your courses.` });
      
      if (data.llm_error_summary) {
        toast({ title: "LLM Warning", description: data.llm_error_summary, variant: "destructive", duration: 7000 });
      }

    } catch (err: any) {
      setError(err.message || 'Failed to generate suggestions.');
      toast({ title: 'Suggestion Generation Failed', description: err.message, variant: 'destructive' });
    } finally {
      setGeneratingAction(null);
    }
  }, [userId, flaskServerBaseUrl, toast, allUserImages, allKnownCourses]);
  
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
  
  const handleAddManualCourse = async () => {
    if (!manualCourseInput.trim() || !userId) return;
    setIsAddingManualCourse(true);
    try {
        const response = await fetch(`${flaskServerBaseUrl}/api/manual-courses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ userId, courseName: manualCourseInput.trim() })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to add course');
        
        toast({ title: "Course Added", description: `"${manualCourseInput.trim()}" has been added.` });
        setManualCourses(prev => [...new Set([...prev, manualCourseInput.trim()])]);
        setManualCourseInput('');

    } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
        setIsAddingManualCourse(false);
    }
  };

  const handleDeleteManualCourse = async (courseName: string) => {
    if (!userId) return;
    setIsDeletingManualCourse(courseName);
    try {
        const response = await fetch(`${flaskServerBaseUrl}/api/manual-courses`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ userId, courseName })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to delete course');

        toast({ title: "Course Deleted", description: `"${courseName}" has been removed.` });
        setManualCourses(prev => prev.filter(c => c !== courseName));

    } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
        setIsDeletingManualCourse(null);
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
                <p className="text-muted-foreground">Loading your certificates and AI suggestions...</p>
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
                <CardTitle>Manually Add Courses</CardTitle>
                <CardDescription>
                  Add course names that weren't from certificates to include them in the AI analysis.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                    <Input 
                        placeholder="e.g., Advanced JavaScript"
                        value={manualCourseInput}
                        onChange={(e) => setManualCourseInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddManualCourse() }}
                        disabled={isAddingManualCourse}
                    />
                    <Button onClick={handleAddManualCourse} disabled={isAddingManualCourse || !manualCourseInput.trim()}>
                        {isAddingManualCourse && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Add
                    </Button>
                </div>
                {manualCourses.length > 0 && (
                    <div className="mt-4 space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Manually Added Courses:</h4>
                        <div className="flex flex-wrap gap-2">
                            {manualCourses.map(course => (
                                <div key={course} className="flex items-center gap-1.5 pl-3 pr-1 py-1 text-sm bg-secondary text-secondary-foreground rounded-full">
                                    <span>{course}</span>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-5 w-5 rounded-full hover:bg-destructive/20" 
                                        onClick={() => handleDeleteManualCourse(course)}
                                        disabled={!!isDeletingManualCourse}
                                        >
                                        {isDeletingManualCourse === course 
                                            ? <Loader2 className="h-3 w-3 animate-spin"/> 
                                            : <X className="h-3 w-3"/>
                                        }
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
              </CardContent>
            </Card>

            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Your Consolidated Course List</CardTitle>
                <CardDescription>
                  This list includes courses from your certificates and any you've added manually. Use this list to generate suggestions.
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
                    <p className="text-muted-foreground italic">No course names have been identified yet. Upload some certificates or add one manually.</p>
                )}
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2">
                 <Button onClick={() => handleGetSuggestions(allKnownCourses, [], 'new')} disabled={generatingAction !== null || newCourses.length === 0}>
                   {generatingAction === 'new' ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
                   Generate for New Courses ({newCourses.length})
                 </Button>
                 <Button onClick={() => handleGetSuggestions(allKnownCourses, allKnownCourses, 'all')} disabled={generatingAction !== null || allKnownCourses.length === 0}>
                   {generatingAction === 'all' ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <BrainCircuit className="mr-2 h-5 w-5" />}
                   Generate for All Courses
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
                                <Button variant="outline" size="sm" onClick={() => handleGetSuggestions(allKnownCourses, [courseData.identified_course_name.replace(' [UNVERIFIED]','')], courseData.identified_course_name)} disabled={generatingAction !== null}>
                                    {generatingAction === courseData.identified_course_name ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>}
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
                            {group.images.map(image => {
                              const imageSrc = `/api/images/${image.fileId}`;
                              const isPdf = image.contentType === 'application/pdf';
                              return (
                                <div key={image.fileId} className="relative group">
                                    <div className="aspect-square relative rounded-md overflow-hidden border shadow-sm bg-muted/20 flex items-center justify-center">
                                      {isPdf ? (
                                        <FileText className="w-1/2 h-1/2 text-muted-foreground/60" />
                                      ) : (
                                        <Image
                                          src={imageSrc}
                                          alt={image.originalName || ''}
                                          fill
                                          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
                                          className="object-contain p-1"
                                          data-ai-hint="certificate image"
                                        />
                                      )}
                                    </div>
                                    <Button size="icon" variant="secondary" className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEditModal(image)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <p className="text-xs text-center mt-1 truncate" title={image.originalName}>{image.originalName}</p>
                                </div>
                              );
                            })}
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
