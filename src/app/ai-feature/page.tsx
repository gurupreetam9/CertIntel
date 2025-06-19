
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Sparkles, ExternalLink, AlertTriangle, Info, CheckCircle, ListChecks, Wand2, BrainCircuit, HelpCircle, RefreshCw, FilePlus, FileSearch } from 'lucide-react';
import NextImage from 'next/image';
import Link from 'next/link';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import SearchWithSuggestions from '@/components/common/SearchWithSuggestions';
import type { SearchableItem } from '@/components/common/SearchWithSuggestions';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UserImage } from '@/components/home/ImageGrid';


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

interface FailedExtractionImage {
  file_id: string;
  original_filename: string;
  reason?: string;
}

interface OcrPhaseResult {
  successfully_extracted_courses?: string[];
  failed_extraction_images?: FailedExtractionImage[];
  processed_image_file_ids?: string[]; // All file IDs user considered for this OCR run
  error?: string;
  message?: string;
}

interface SuggestionsPhaseResult {
  user_processed_data?: UserProcessedCourseData[];
  llm_error_summary?: string | null;
  associated_image_file_ids?: string[]; // File IDs associated with the data that LED to these suggestions
  error?: string;
  message?: string;
  processedAt?: string; // Timestamp of processing
}

type ProcessingPhase = 'initial' | 'ocrProcessing' | 'manualNaming' | 'readyForSuggestions' | 'suggestionsProcessing' | 'results';
type OcrMode = 'new' | 'all';


function AiFeaturePageContent() {
  const flaskServerBaseUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL || 'http://localhost:5000';
  const { toast } = useToast();
  const { userId, user } = useAuth();

  const [phase, setPhase] = useState<ProcessingPhase>('initial');
  const [isLoadingOcr, setIsLoadingOcr] = useState<boolean>(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState<boolean>(false);
  const [isFetchingInitialData, setIsFetchingInitialData] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [generalManualCoursesInput, setGeneralManualCoursesInput] = useState<string>('');

  const [ocrSuccessfullyExtracted, setOcrSuccessfullyExtracted] = useState<string[]>([]);
  const [ocrFailedImages, setOcrFailedImages] = useState<FailedExtractionImage[]>([]);
  
  const [allUserImageMetas, setAllUserImageMetas] = useState<UserImage[]>([]);
  const [ocrConsideredFileIds, setOcrConsideredFileIds] = useState<string[]>([]); 
  const [potentiallyNewImageFileIds, setPotentiallyNewImageFileIds] = useState<string[]>([]); 

  const [manualNamesForFailedImages, setManualNamesForFailedImages] = useState<{ [key: string]: string }>({});

  const [finalResult, setFinalResult] = useState<SuggestionsPhaseResult | null>(null);
  const [resultsSearchTerm, setResultsSearchTerm] = useState<string>('');
  const [isRefreshingCourse, setIsRefreshingCourse] = useState<string | null>(null);


  useEffect(() => {
    const fetchInitialData = async () => {
      if (!userId || !user) {
        setIsFetchingInitialData(false);
        return;
      }
      setIsFetchingInitialData(true);
      setError(null); 
      setFinalResult(null); 
      setOcrConsideredFileIds([]);
      
      try {
        const idToken = await user.getIdToken();
        const imagesResponse = await fetch(`/api/user-images?userId=${userId}`, { headers: { 'Authorization': `Bearer ${idToken}` }});
        if (!imagesResponse.ok) throw new Error('Failed to fetch user images metadata.');
        const imagesData: UserImage[] = await imagesResponse.json();
        setAllUserImageMetas(imagesData);
        console.log("AI Feature: Fetched all user image metas:", imagesData.length);

        const latestResultsResponse = await fetch(`${flaskServerBaseUrl}/api/latest-processed-results?userId=${userId}`, {
          headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        const responseText = await latestResultsResponse.text(); 

        if (!latestResultsResponse.ok) {
          let errorMessage = `Error fetching latest results: ${latestResultsResponse.status} ${latestResultsResponse.statusText}`;
           if (responseText.toLowerCase().includes("<!doctype html") && responseText.toLowerCase().includes("ngrok.com")) {
            errorMessage = `Received ngrok interstitial page. Ensure your ngrok tunnel for Flask (${flaskServerBaseUrl}) is active and you've visited it in your browser, or configured it to skip warnings.`;
          } else {
            try {
              const errJson = JSON.parse(responseText); 
              errorMessage = errJson.error || errJson.message || errorMessage;
              if (errJson.errorKey === "DB_COMPONENT_UNAVAILABLE") {
                errorMessage = `Database connection error on the backend server when fetching latest results. Please ensure the backend server (Flask) is connected to MongoDB. Original: ${errorMessage}`;
              }
            } catch (e) {
               if (responseText.toLowerCase().includes("<!doctype html")) {
                  errorMessage = `Server returned an HTML error page (Status: ${latestResultsResponse.status}). Check Flask server logs or if the server is running at ${flaskServerBaseUrl}.`;
              } else if (responseText.length > 0 && responseText.length < 300) { 
                  errorMessage = `Server error (${latestResultsResponse.status}): ${responseText}`;
              } else {
                   errorMessage = `Server error (${latestResultsResponse.status}). Response preview: ${responseText.substring(0, 200)}...`;
              }
            }
          }
          console.warn(`AI Feature: Failed to fetch latest results. Status: ${latestResultsResponse.status}. Message: ${errorMessage}. Raw text (first 200): ${responseText.substring(0,200)}`);
          setError(errorMessage);
          setFinalResult(null);
          setOcrConsideredFileIds([]); 
          setPhase('initial');
          toast({ title: 'Could Not Load Previous Data', description: errorMessage, variant: 'destructive', duration: 10000 });
        } else { 
            try {
                const latestResultsData: SuggestionsPhaseResult = JSON.parse(responseText);
                if (latestResultsData && latestResultsData.user_processed_data && latestResultsData.user_processed_data.length > 0) {
                    setFinalResult(latestResultsData);
                    setOcrConsideredFileIds(latestResultsData.associated_image_file_ids || []); 
                    setPhase('results');
                    setError(null); 
                    console.log("AI Feature: Loaded latest processed results:", latestResultsData);
                    toast({ title: "Previous Results Loaded", description: `Showing your last processed certificate insights from ${latestResultsData.processedAt ? new Date(latestResultsData.processedAt).toLocaleString() : 'a previous session'}.`});
                } else {
                     console.log("AI Feature: No substantive previous results found from valid JSON response.");
                     setFinalResult(null); 
                     setOcrConsideredFileIds([]); 
                     if(phase === 'results' && (!latestResultsData || !latestResultsData.user_processed_data || latestResultsData.user_processed_data.length === 0)) {
                        setPhase('initial');
                     }
                }
            } catch (jsonParseError: any) {
                 let detailedError = 'Received an unexpected data format from the server when fetching latest results.';
                 if (responseText.toLowerCase().includes("<!doctype html") && responseText.toLowerCase().includes("ngrok.com")) {
                    detailedError = `Received ngrok interstitial page instead of JSON. Ensure your ngrok tunnel for Flask (${flaskServerBaseUrl}) is active, you've visited it in your browser, or configured it to skip warnings.`;
                    console.error("AI Feature: Flask server returned ngrok interstitial page. Response text (first 500 chars):", responseText.substring(0, 500), "Error:", jsonParseError);
                 } else {
                    console.error("AI Feature: Successfully fetched from Flask (status OK), but failed to parse response as JSON. Response text (first 500 chars):", responseText.substring(0, 500), "Error:", jsonParseError);
                 }
                 setError(detailedError); 
                 setFinalResult(null);
                 setOcrConsideredFileIds([]);    
                 setPhase('initial');     
                 toast({ title: 'Error Loading Previous Data', description: detailedError, variant: 'destructive', duration: 10000 });
            }
        }
      } catch (err: any) { 
        console.error("AI Feature: Error fetching initial data:", err);
        let genericMessage = `An error occurred while loading your initial data. Please check your Flask server connectivity and ngrok tunnel status.`;
        if (err.message && err.message.includes('Failed to fetch')) {
            genericMessage = `Network error: Could not connect to the server at ${flaskServerBaseUrl}. Ensure the Flask server and ngrok tunnel are running and accessible.`;
        } else if (err.message) {
            genericMessage += ` Original Error: ${err.message}`;
        }
        setError(genericMessage); 
        setFinalResult(null);
        setOcrConsideredFileIds([]);
        setPhase('initial');
        toast({ title: 'Error Loading Initial Data', description: genericMessage, variant: 'destructive', duration: 10000 });
      } finally {
        setIsFetchingInitialData(false);
      }
    };
    fetchInitialData();
  }, [userId, user, flaskServerBaseUrl, toast]);


  useEffect(() => {
    if (allUserImageMetas.length > 0 && !isFetchingInitialData) {
      const allCurrentIds = allUserImageMetas.map(img => img.fileId);
      const newPotentiallyNew = allCurrentIds.filter(id => !ocrConsideredFileIds.includes(id));
      
      if (newPotentiallyNew.length !== potentiallyNewImageFileIds.length || 
          !newPotentiallyNew.every(id => potentiallyNewImageFileIds.includes(id)) || 
          !potentiallyNewImageFileIds.every(id => newPotentiallyNew.includes(id))) {
        setPotentiallyNewImageFileIds(newPotentiallyNew);
      }

      if (newPotentiallyNew.length > 0 && phase !== 'ocrProcessing' && phase !== 'suggestionsProcessing') {
          if (newPotentiallyNew.length > 0) { 
             toast({
                title: "New Certificates Detected",
                description: `You have ${newPotentiallyNew.length} certificate(s) that haven't been processed for AI insights. You can process them now.`,
                duration: 7000
             });
          }
      }
    } else if (!isFetchingInitialData) {
      setPotentiallyNewImageFileIds([]);
    }
  }, [allUserImageMetas, ocrConsideredFileIds, isFetchingInitialData, phase, toast, potentiallyNewImageFileIds.length]);


  const handleManualNameChange = (fileId: string, name: string) => {
    setManualNamesForFailedImages(prev => ({ ...prev, [fileId]: name }));
  };
  
  const saveManualCourseNames = async () => {
    if (!userId || Object.keys(manualNamesForFailedImages).length === 0) return;
    const namesToSave = Object.entries(manualNamesForFailedImages)
      .filter(([_, name]) => name && name.trim().length > 0)
      .map(([fileId, courseName]) => ({ userId, fileId, courseName: courseName.trim() }));
    if (namesToSave.length === 0) return;

    toast({ title: 'Saving Manual Names...', description: `Attempting to save ${namesToSave.length} manual names.`});
    const savePromises = namesToSave.map(item =>
      fetch(`${flaskServerBaseUrl}/api/manual-course-name`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }, 
        body: JSON.stringify(item),
      }).then(async res => {
        if (!res.ok) { 
            const errorText = await res.text().catch(() => "Failed to read error response");
            console.warn(`Failed to save manual name for ${item.fileId}. Status: ${res.status}. Response: ${errorText.substring(0,100)}`);
        }
      }).catch(err => {
        console.error(`Error saving manual name for ${item.fileId}: ${err.message}`);
      })
    );
    await Promise.all(savePromises);
    toast({ title: 'Manual Names Processed', description: 'Attempted to save entered manual names.'});
  };

  const fetchSuggestions = useCallback(async (coursesToGetSuggestionsFor: string[], forceRefreshList: string[] = []) => {
    if (!userId) return;
    setIsLoadingSuggestions(true); // Ensure loading state is set before async operations
    setError(null);

    if (coursesToGetSuggestionsFor.length === 0) {
      toast({ title: 'No Courses', description: 'No courses available to get suggestions for.', variant: 'destructive' });
      setIsLoadingSuggestions(false);
      setPhase(ocrFailedImages.length > 0 ? 'manualNaming' : (ocrSuccessfullyExtracted.length > 0 || generalManualCoursesInput.trim().length > 0 ? 'readyForSuggestions' : 'initial'));
      return;
    }

    try {
      const endpoint = `${flaskServerBaseUrl}/api/process-certificates`;
      const payload: any = {
        userId,
        mode: 'suggestions_only',
        knownCourseNames: coursesToGetSuggestionsFor
      };
      if (forceRefreshList.length > 0) {
        payload.forceRefreshForCourses = forceRefreshList;
      }
      
      if (ocrConsideredFileIds.length > 0) {
         payload.associated_image_file_ids_from_previous_run = ocrConsideredFileIds;
      }

      const response = await fetch(endpoint, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }, 
        body: JSON.stringify(payload),
      });
      const data: SuggestionsPhaseResult = await response.json();

      if (!response.ok || data.error) throw new Error(data.error || `Server error: ${response.status}`);

      setFinalResult(prevResult => {
        const newProcessedData = data.user_processed_data || [];
        let updatedUserProcessedDataMap = new Map<string, UserProcessedCourseData>();

        // If it's not a specific course refresh, start with previous results
        if (!forceRefreshList || forceRefreshList.length === 0) {
          (prevResult?.user_processed_data || []).forEach(item => {
            updatedUserProcessedDataMap.set(item.identified_course_name, item);
          });
        } else {
           // For single refresh, keep only NON-REFRESHED items from previous results to be merged with the new one.
           (prevResult?.user_processed_data || []).forEach(item => {
             if (!forceRefreshList.includes(item.identified_course_name)) {
                updatedUserProcessedDataMap.set(item.identified_course_name, item);
             }
           });
        }
        
        // Merge or add new/refreshed data
        newProcessedData.forEach(item => {
          updatedUserProcessedDataMap.set(item.identified_course_name, { ...item, processed_by: item.processed_by || "Cohere" });
        });
        
        const finalUserProcessedData = Array.from(updatedUserProcessedDataMap.values())
            .sort((a, b) => a.identified_course_name.localeCompare(b.identified_course_name));

        return {
          user_processed_data: finalUserProcessedData,
          llm_error_summary: data.llm_error_summary !== undefined ? data.llm_error_summary : prevResult?.llm_error_summary,
          associated_image_file_ids: data.associated_image_file_ids && data.associated_image_file_ids.length > 0 
                                      ? data.associated_image_file_ids 
                                      : ocrConsideredFileIds,
          processedAt: new Date().toISOString(),
        };
      });
      
      setPhase('results');

      if (data.user_processed_data && data.user_processed_data.length > 0) {
        toast({ title: 'Suggestions Generated/Updated', description: `AI suggestions and descriptions ready for ${coursesToGetSuggestionsFor.length} course(s).` });
      } else if (data.message) {
         toast({ title: 'Processing Info', description: data.message });
      }
      if (data.llm_error_summary) {
        toast({ title: "LLM Warning", description: data.llm_error_summary, variant: "destructive", duration: 7000 });
      }

    } catch (err: any) {
      setError(err.message || 'Failed suggestions phase.');
      toast({ title: 'Suggestions Phase Failed', description: err.message, variant: 'destructive' });
      setPhase(ocrFailedImages.length > 0 ? 'manualNaming' : (ocrSuccessfullyExtracted.length > 0 || generalManualCoursesInput.trim().length > 0 ? 'readyForSuggestions' : 'initial'));
    } finally {
      setIsLoadingSuggestions(false);
      setIsRefreshingCourse(null);
    }
  }, [userId, flaskServerBaseUrl, toast, ocrConsideredFileIds, generalManualCoursesInput, ocrSuccessfullyExtracted, ocrFailedImages]);

  const handleInitiateOcrProcessing = useCallback(async (ocrMode: OcrMode) => {
    if (!userId || !user) { toast({ title: 'Authentication Required', variant: 'destructive' }); return; }
    if (isLoadingOcr) return;

    setError(null);
    setPhase('ocrProcessing');
    setIsLoadingOcr(true);

    setOcrSuccessfullyExtracted([]);
    setOcrFailedImages([]);
    setManualNamesForFailedImages({});
      
    const generalManualCourses = generalManualCoursesInput.split(',').map(c => c.trim()).filter(c => c.length > 0);
    let idsToProcessForOcr: string[];

    if (ocrMode === 'new') {
        idsToProcessForOcr = potentiallyNewImageFileIds;
        if (idsToProcessForOcr.length === 0 && generalManualCourses.length === 0) {
            toast({ title: "Nothing New to Process", description: "No new certificates detected and no general courses entered.", variant: "default"});
            setIsLoadingOcr(false);
            setPhase(finalResult && finalResult.user_processed_data && finalResult.user_processed_data.length > 0 ? 'results' : 'initial');
            return;
        }
        toast({ title: "Processing New Certificates...", description: `Scanning ${idsToProcessForOcr.length} new certificate(s) and any general courses.`});
    } else { // 'all'
        idsToProcessForOcr = allUserImageMetas.map(img => img.fileId);
        if (idsToProcessForOcr.length === 0 && generalManualCourses.length === 0) {
            toast({ title: "Nothing to Process", description: "Please upload some certificates or add general courses manually.", variant: "default"});
            setIsLoadingOcr(false);
            setPhase(finalResult && finalResult.user_processed_data && finalResult.user_processed_data.length > 0 ? 'results' : 'initial');
            return;
        }
        toast({ title: "Processing All Certificates...", description: `Scanning ${idsToProcessForOcr.length} certificate(s) and any general courses.`});
    }
    
    try {
      const endpoint = `${flaskServerBaseUrl}/api/process-certificates`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${await user.getIdToken()}`,
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          userId,
          mode: 'ocr_only',
          additionalManualCourses: generalManualCourses,
          allImageFileIds: idsToProcessForOcr 
        }),
      });
      const data: OcrPhaseResult = await response.json();

      if (!response.ok || data.error) throw new Error(data.error || `Server error: ${response.status}`);

      setOcrSuccessfullyExtracted(data.successfully_extracted_courses || []);
      setOcrFailedImages(data.failed_extraction_images || []);
      
      const newlyProcessedInThisRun = data.processed_image_file_ids || [];
      if (ocrMode === 'new') {
          setOcrConsideredFileIds(prev => [...new Set([...prev, ...newlyProcessedInThisRun])]);
      } else { // ocrMode === 'all'
          setOcrConsideredFileIds(newlyProcessedInThisRun);
      }

      if (data.failed_extraction_images && data.failed_extraction_images.length > 0) {
        setPhase('manualNaming');
        toast({
          title: 'Action Required',
          description: `${data.failed_extraction_images.length} certificate(s) couldn't be identified by OCR or have no prior manual name. Please name them below if needed.`,
          duration: 7000
        });
      } else if ((data.successfully_extracted_courses && data.successfully_extracted_courses.length > 0) || generalManualCourses.length > 0) {
        setPhase('readyForSuggestions');
      } else {
        toast({ title: 'Nothing New to Process by OCR', description: data.message || 'No new courses extracted by OCR and no general manual courses provided.' });
        setPhase(finalResult && finalResult.user_processed_data && finalResult.user_processed_data.length > 0 ? 'results' : 'initial');
      }

    } catch (err: any) {
      setError(err.message || 'Failed OCR phase.');
      toast({ title: 'OCR Phase Failed', description: err.message, variant: 'destructive' });
      setPhase(finalResult && finalResult.user_processed_data && finalResult.user_processed_data.length > 0 ? 'results' : 'initial');
    } finally {
      setIsLoadingOcr(false);
    }
  }, [userId, user, flaskServerBaseUrl, generalManualCoursesInput, toast, isLoadingOcr, allUserImageMetas, potentiallyNewImageFileIds, finalResult]);

  const handleGetSuggestionsForManualCoursesOnly = useCallback(async () => {
      if (!userId || generalManualCoursesInput.trim().length === 0) return;
      const generalManualCourses = generalManualCoursesInput.split(',').map(c => c.trim()).filter(c => c.length > 0);
      if (generalManualCourses.length === 0) {
          toast({ title: "No Manual Courses", description: "Please enter some course names in the textarea first." });
          return;
      }
      setPhase('suggestionsProcessing'); 
      await fetchSuggestions(generalManualCourses);
  }, [userId, generalManualCoursesInput, fetchSuggestions, toast, setPhase]);

  const handleProceedToSuggestionsAfterOcr = useCallback(async () => {
     if (phase === 'manualNaming') {
        await saveManualCourseNames();
     }
    const userProvidedNamesForFailures = Object.values(manualNamesForFailedImages).map(name => name.trim()).filter(name => name.length > 0);
    const generalManualCourses = generalManualCoursesInput.split(',').map(c => c.trim()).filter(c => c.length > 0);
    const allKnownCourses = [...new Set([...ocrSuccessfullyExtracted, ...userProvidedNamesForFailures, ...generalManualCourses])].filter(name => name && name.length > 0);
    
    if (allKnownCourses.length === 0) {
        toast({ title: "No Courses Available", description: "No courses identified or entered to get suggestions for."});
        setPhase(finalResult && finalResult.user_processed_data && finalResult.user_processed_data.length > 0 ? 'results' : 'initial');
        return;
    }
    setPhase('suggestionsProcessing');
    await fetchSuggestions(allKnownCourses);
  }, [phase, manualNamesForFailedImages, generalManualCoursesInput, ocrSuccessfullyExtracted, fetchSuggestions, toast, finalResult, setPhase]);

  const handleRefreshSingleCourseSuggestions = async (courseName: string) => {
    if (!userId) return;
    setIsRefreshingCourse(courseName); 
    setPhase('suggestionsProcessing'); // To show global loading state if desired
    await fetchSuggestions([courseName], [courseName]); 
  };


  const handleResultsSearch = (query: string) => {
    setResultsSearchTerm(query.toLowerCase());
  };

  const aiFeatureSearchableResults: SearchableItem[] = useMemo(() => {
    if (!finalResult?.user_processed_data) return [];
    return finalResult.user_processed_data.map(courseData => ({
      id: courseData.identified_course_name, 
      value: courseData.identified_course_name,
    }));
  }, [finalResult?.user_processed_data]);

  const filteredFinalResults = useMemo(() => {
    if (!finalResult?.user_processed_data) return [];
    if (!resultsSearchTerm.trim()) return finalResult.user_processed_data;
    return finalResult.user_processed_data.filter(courseData =>
      courseData.identified_course_name.toLowerCase().includes(resultsSearchTerm)
    );
  }, [finalResult?.user_processed_data, resultsSearchTerm]);

  const canProcessNew = potentiallyNewImageFileIds.length > 0;
  const canProcessAll = allUserImageMetas.length > 0 || generalManualCoursesInput.trim().length > 0;
  const canGetManualSuggestions = generalManualCoursesInput.trim().length > 0;
  const allKnownCoursesForProceedButton = useMemo(() => {
      const userProvidedNamesForFailures = Object.values(manualNamesForFailedImages).map(name => name.trim()).filter(name => name.length > 0);
      const generalManualCourses = generalManualCoursesInput.split(',').map(c => c.trim()).filter(c => c.length > 0);
      return [...new Set([...ocrSuccessfullyExtracted, ...userProvidedNamesForFailures, ...generalManualCourses])].filter(name => name && name.length > 0);
  }, [ocrSuccessfullyExtracted, manualNamesForFailedImages, generalManualCoursesInput]);
  const canProceedToSuggestionsAfterOcr = (phase === 'readyForSuggestions' || phase === 'manualNaming') && allKnownCoursesForProceedButton.length > 0;


  return (
    <TooltipProvider>
      <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8 flex flex-col">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon" aria-label="Go back to Home">
              <Link href="/"><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
            <h1 className="text-3xl font-bold font-headline">Certificate Insights &amp; Recommendations</h1>
          </div>
        </div>
        
        {isFetchingInitialData && (
            <div className="flex flex-col items-center justify-center text-center py-10">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
                <p className="text-muted-foreground">Loading your data...</p>
            </div>
        )}

        {!isFetchingInitialData && (
          <>
            <p className="mb-4 text-muted-foreground">
              Use OCR to extract course names from certificates, or add names manually. Then, get AI-powered descriptions and next-step suggestions.
            </p>

            {/* Textarea for General Manual Courses */}
             <div className="space-y-2 mb-6">
                <Label htmlFor="generalManualCourses">Manually Add General Course Names (comma-separated)</Label>
                <Textarea
                  id="generalManualCourses"
                  placeholder="e.g., Advanced Python, Introduction to Docker"
                  value={generalManualCoursesInput}
                  onChange={(e) => setGeneralManualCoursesInput(e.target.value)}
                  className="min-h-[80px]"
                  disabled={isLoadingOcr || isLoadingSuggestions}
                />
              </div>
            
            {/* Action Buttons Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* OCR Processing Buttons */}
                {canProcessNew && (
                    <Button
                        onClick={() => handleInitiateOcrProcessing('new')}
                        disabled={isLoadingOcr || isLoadingSuggestions || !user}
                        size="lg"
                        variant="default"
                        className="w-full"
                    >
                        <FilePlus className="mr-2 h-5 w-5" />
                        Process {potentiallyNewImageFileIds.length} New Certificate(s) &amp; Manual Courses
                    </Button>
                )}
                 <Button
                    onClick={() => handleInitiateOcrProcessing('all')}
                    disabled={isLoadingOcr || isLoadingSuggestions || !user || !canProcessAll}
                    size="lg"
                    variant={canProcessNew ? "outline" : "default"}
                    className="w-full"
                >
                    <ListChecks className="mr-2 h-5 w-5" />
                    Process All Certificates &amp; Manual Courses
                </Button>

                {/* Suggestion Buttons */}
                {canGetManualSuggestions && (
                     <Button
                        onClick={handleGetSuggestionsForManualCoursesOnly}
                        disabled={isLoadingOcr || isLoadingSuggestions || !user}
                        size="lg"
                        variant="outline" // Or default if it's a primary path
                        className="w-full"
                    >
                        <Sparkles className="mr-2 h-5 w-5" />
                        Get Suggestions for Manual Courses Only
                    </Button>
                )}
                {(phase === 'readyForSuggestions' || phase === 'manualNaming') && (
                     <Button
                        onClick={handleProceedToSuggestionsAfterOcr}
                        disabled={isLoadingOcr || isLoadingSuggestions || !user || !canProceedToSuggestionsAfterOcr}
                        size="lg"
                        variant="default"
                        className="w-full"
                    >
                        <BrainCircuit className="mr-2 h-5 w-5" />
                        Get AI Suggestions ({allKnownCoursesForProceedButton.length} Course(s))
                    </Button>
                )}
            </div>
            
            {/* Loading States */}
            {(isLoadingOcr || isLoadingSuggestions) && (
                <div className="flex items-center justify-center my-4 p-4 bg-muted/50 rounded-md">
                    <Loader2 className="mr-3 h-6 w-6 animate-spin text-primary" />
                    <p className="text-muted-foreground">
                        {isLoadingOcr && "Processing Certificates (OCR)..."}
                        {isLoadingSuggestions && "Generating AI Suggestions..."}
                    </p>
                </div>
            )}


            {!user && <p className="text-sm text-destructive mb-6">Please log in to process certificates.</p>}
            {error && ( 
              <Card className="mb-6 border-destructive bg-destructive/10">
                <CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2"/>Error Encountered</CardTitle></CardHeader>
                <CardContent><p>{error}</p></CardContent>
              </Card>
            )}

            {phase === 'manualNaming' && ocrFailedImages.length > 0 && (
              <Card className="my-6 border-amber-500 bg-amber-500/10">
                <CardHeader>
                  <CardTitle className="text-xl font-headline text-amber-700 flex items-center">
                    <AlertTriangle className="mr-2 h-5 w-5" /> Name Unidentified Certificates
                  </CardTitle>
                  <CardDescription>
                    OCR couldn't identify names for {ocrFailedImages.length} image(s) that don't have a prior manual name.
                    Provide names below. Saved names are used in future OCR runs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 max-h-96 overflow-y-auto pr-2">
                  {ocrFailedImages.map(img => (
                    <div key={img.file_id} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-3 border rounded-md bg-background/50 shadow-sm">
                      <div className="relative w-full sm:w-24 h-32 sm:h-24 rounded-md overflow-hidden shrink-0 border">
                        {img.file_id !== 'N/A' ? (
                          <NextImage
                            src={`/api/images/${img.file_id}`}
                            alt={`Certificate: ${img.original_filename}`}
                            fill sizes="(max-width: 640px) 100vw, 96px" className="object-contain" data-ai-hint="certificate needs naming"
                          />
                        ) : ( <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">No Preview</div> )}
                      </div>
                      <div className="flex-grow space-y-1 w-full sm:w-auto">
                        <p className="text-xs font-semibold text-muted-foreground truncate" title={img.original_filename}>{img.original_filename}</p>
                        {img.reason && <p className="text-xs text-amber-600 italic">Reason: {img.reason}</p>}
                        <Input
                          type="text" placeholder="Enter course name for this image"
                          value={manualNamesForFailedImages[img.file_id] || ''}
                          onChange={(e) => handleManualNameChange(img.file_id, e.target.value)}
                          className="w-full mt-1" aria-label={`Manual course name for ${img.original_filename}`} disabled={isLoadingOcr || isLoadingSuggestions}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
                <CardFooter className="pt-4">
                  <Button onClick={handleProceedToSuggestionsAfterOcr} disabled={isLoadingOcr || isLoadingSuggestions || !user || !canProceedToSuggestionsAfterOcr} className="w-full">
                    <Wand2 className="mr-2 h-5 w-5" />
                    Save Names &amp; Proceed to Suggestions ({allKnownCoursesForProceedButton.length} Total)
                  </Button>
                </CardFooter>
              </Card>
            )}

            {phase === 'manualNaming' && ocrSuccessfullyExtracted.length > 0 && (
              <Card className="mb-6 border-green-500 bg-green-500/10">
                  <CardHeader>
                      <CardTitle className="text-lg font-headline text-green-700 flex items-center">
                          <CheckCircle className="mr-2 h-5 w-5" /> Identified Courses (OCR &amp; Saved Manual)
                      </CardTitle>
                      <CardDescription>These courses were identified by OCR or from saved manual entries. Displaying {ocrSuccessfullyExtracted.length}.</CardDescription>
                  </CardHeader>
                  <CardContent><ul className="list-disc pl-5 text-sm text-green-700">{ocrSuccessfullyExtracted.map(course => <li key={course}>{course}</li>)}</ul></CardContent>
              </Card>
            )}

            {(phase === 'readyForSuggestions' && allKnownCoursesForProceedButton.length === 0) && (
              <Card className="my-6 border-blue-500 bg-blue-500/10">
                <CardHeader><CardTitle className="text-lg font-headline text-blue-700 flex items-center"><Info className="mr-2 h-5 w-5" /> No Courses Identified</CardTitle></CardHeader>
                <CardContent><p className="text-blue-700">No courses identified from certificates or manual input. Add courses to get AI suggestions.</p></CardContent>
              </Card>
            )}

            {phase === 'results' && finalResult && (
              <div className="flex flex-col min-h-0"> {/* Allow results to grow and scroll */}
                <div className="my-4 shrink-0"> {/* Search bar does not grow */}
                    <SearchWithSuggestions
                        onSearch={handleResultsSearch} placeholder="Search your processed courses..."
                        searchableData={aiFeatureSearchableResults}
                    />
                </div>
                <div className="flex-grow min-h-0 overflow-y-auto border border-border rounded-lg shadow-md p-4 bg-card space-y-6"> {/* Results list scrolls */}
                  <h2 className="text-2xl font-headline mb-4 border-b pb-2">Processed Result &amp; AI Suggestions:</h2>
                  {finalResult.processedAt && <p className="text-xs text-muted-foreground mb-3">Results from: {new Date(finalResult.processedAt).toLocaleString()}</p>}

                  {finalResult.associated_image_file_ids && finalResult.associated_image_file_ids.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold mb-3 font-headline">Certificate Images Associated with these Suggestions:</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {finalResult.associated_image_file_ids.map(fileId => {
                            const imgMeta = allUserImageMetas.find(m => m.fileId === fileId);
                            return (
                              <Tooltip key={`processed-${fileId}`}>
                                <TooltipTrigger asChild>
                                  <div className="aspect-[4/3] relative rounded-md overflow-hidden border shadow-sm cursor-help">
                                    <NextImage src={`/api/images/${fileId}`} alt={`Processed certificate image ${fileId}`} fill sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw" className="object-contain" data-ai-hint="certificate image" />
                                    <a href={`/api/images/${fileId}`} target="_blank" rel="noopener noreferrer" className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full hover:bg-black/70 transition-colors" title="Open image" onClick={e=>e.stopPropagation()}><ExternalLink className="w-3 h-3"/></a>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent><p>{imgMeta?.originalName || fileId}</p></TooltipContent>
                              </Tooltip>
                            );
                        })}
                      </div>
                    </div>
                  )}

                  {finalResult.message && !filteredFinalResults?.length && ( <Card className="bg-blue-500/10 border-blue-500"><CardHeader className="flex-row items-center gap-2"><Info className="w-5 h-5 text-blue-700" /><CardTitle className="text-blue-700 text-lg">Information</CardTitle></CardHeader><CardContent><p className="text-blue-700">{finalResult.message}</p></CardContent></Card> )}
                  {finalResult.llm_error_summary && ( <Card className="border-amber-500 bg-amber-500/10"><CardHeader className="flex-row items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-700" /><CardTitle className="text-amber-700 text-lg">LLM Warning</CardTitle></CardHeader><CardContent><p className="text-amber-700">{finalResult.llm_error_summary}</p></CardContent></Card> )}

                  {filteredFinalResults && filteredFinalResults.length > 0 ? (
                    <div className="space-y-6">
                      <h3 className="text-lg font-semibold font-headline">Identified Courses &amp; AI Suggestions:</h3>
                      {filteredFinalResults.map((identifiedCourseData) => {
                        const originalName = identifiedCourseData.identified_course_name;
                        const isUnverified = originalName.endsWith(" [UNVERIFIED]");
                        const displayName = isUnverified ? originalName.replace(" [UNVERIFIED]", "") : originalName;
                        const currentProcessedBy = identifiedCourseData.processed_by || "LLM"; 
                        const key = `identified-${originalName.replace(/\s+/g, '-')}-${currentProcessedBy}-${Math.random()}`; 

                        return (
                          <Card key={key} className="bg-background/50 shadow-inner">
                            <CardHeader>
                              <div className="flex justify-between items-start">
                                <div>
                                  <CardTitle className="text-xl font-headline text-primary flex items-center">
                                    {displayName}
                                    {isUnverified && ( <Tooltip><TooltipTrigger asChild><HelpCircle className="ml-2 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent><p>This course was auto-identified and not from a pre-defined list.</p></TooltipContent></Tooltip> )}
                                  </CardTitle>
                                  {identifiedCourseData.ai_description && ( <CardDescription className="pt-1 text-sm">AI Description ({currentProcessedBy}): {identifiedCourseData.ai_description}</CardDescription> )}
                                  {identifiedCourseData.description_from_graph && !identifiedCourseData.ai_description && ( <CardDescription className="pt-1 text-sm italic">Graph Description: {identifiedCourseData.description_from_graph}</CardDescription> )}
                                  {!identifiedCourseData.ai_description && !identifiedCourseData.description_from_graph && ( <CardDescription className="pt-1 text-sm italic">No description available.</CardDescription> )}
                                </div>
                                <Button variant="outline" size="sm" onClick={() => handleRefreshSingleCourseSuggestions(originalName)} disabled={isRefreshingCourse === originalName || isLoadingOcr || isLoadingSuggestions}>
                                  {isRefreshingCourse === originalName ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>}
                                  Refresh Suggestions
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <h4 className="font-semibold text-md">AI Suggested Next Steps ({currentProcessedBy}):</h4>
                              {identifiedCourseData.llm_suggestions && identifiedCourseData.llm_suggestions.length > 0 ? (
                                <ul className="space-y-3 list-none pl-0">
                                  {identifiedCourseData.llm_suggestions.map((suggestion, sugIndex) => (
                                    <li key={`sug-${originalName.replace(/\s+/g, '-')}-${sugIndex}-${suggestion.name.replace(/\s+/g, '-')}`} className="border p-3 rounded-md bg-card shadow-sm">
                                      <p className="font-medium text-base">{suggestion.name}</p>
                                      <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">{suggestion.description}</p>
                                      {suggestion.url && ( <Button variant="link" size="sm" asChild className="px-0 h-auto text-primary hover:text-primary/80"><a href={suggestion.url} target="_blank" rel="noopener noreferrer">Learn more <ExternalLink className="ml-1 h-3 w-3" /></a></Button> )}
                                    </li>
                                  ))}
                                </ul>
                              ) : identifiedCourseData.llm_error ? ( <p className="text-sm text-amber-700 italic">Note: {identifiedCourseData.llm_error}</p> ) : ( <p className="text-sm text-muted-foreground italic">No specific AI suggestions available for this item.</p> )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  ) : ( phase === 'results' && resultsSearchTerm.trim() && <p className="text-muted-foreground italic">No courses match your search term "{resultsSearchTerm}".</p> )}
                  {phase === 'results' && !resultsSearchTerm.trim() && !filteredFinalResults?.length && ( <p className="text-muted-foreground italic">No comprehensive suggestions were generated in this run.</p> )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
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
    
    

    
    

    

    

    

    
    



