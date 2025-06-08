
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Sparkles, ExternalLink, AlertTriangle, Info, CheckCircle, ListChecks, Wand2 } from 'lucide-react';
import NextImage from 'next/image';
import Link from 'next/link';
import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

// --- TypeScript Interfaces ---
interface LLMSuggestion {
  name: string;
  description: string;
  url: string;
}

interface UserProcessedCourseData { // For the final rich result items
  identified_course_name: string;
  description_from_graph?: string | null;
  ai_description?: string | null; // AI-generated description of the *identified_course_name*
  llm_suggestions: LLMSuggestion[]; // List of detailed suggestions for the identified_course_name
  llm_error?: string | null; // Error specific to this identified_course's LLM processing
}

interface FailedExtractionImage {
  file_id: string;
  original_filename: string;
  reason?: string;
}

// For Phase 1 (OCR only) response from backend
interface OcrPhaseResult {
  successfully_extracted_courses?: string[];
  failed_extraction_images?: FailedExtractionImage[];
  processed_image_file_ids?: string[]; // IDs of all images *attempted* in OCR phase
  error?: string;
  message?: string; // General message from backend
}

// For Phase 2 (Suggestions) response from backend - this is the final structure
interface SuggestionsPhaseResult {
  user_processed_data?: UserProcessedCourseData[]; // Main data
  llm_error_summary?: string | null; // General error from LLM batch call if any
  associated_image_file_ids?: string[]; // From backend if it sends them with suggestions
  error?: string; // Top-level error from Flask
  message?: string; // General message from Flask
}

type ProcessingPhase = 'initial' | 'manualNaming' | 'processingSuggestions' | 'results';


function AiFeaturePageContent() {
  const flaskServerBaseUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL || 'http://localhost:5000';
  const { toast } = useToast();
  const { userId, user } = useAuth();

  // State Management
  const [phase, setPhase] = useState<ProcessingPhase>('initial');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [generalManualCoursesInput, setGeneralManualCoursesInput] = useState<string>('');
  
  // Data from OCR phase (Phase 1)
  const [ocrSuccessfullyExtracted, setOcrSuccessfullyExtracted] = useState<string[]>([]);
  const [ocrFailedImages, setOcrFailedImages] = useState<FailedExtractionImage[]>([]);
  // This will now store image IDs related to the final suggestion results, if backend sends them.
  // ocrProcessedImageFileIds was more for the OCR step; this is for the final display.
  const [associatedImageFileIdsForResults, setAssociatedImageFileIdsForResults] = useState<string[]>([]);


  // User input for failed images during 'manualNaming' phase
  const [manualNamesForFailedImages, setManualNamesForFailedImages] = useState<{ [key: string]: string }>({});
  
  // Final result from suggestions phase (Phase 2)
  const [finalResult, setFinalResult] = useState<SuggestionsPhaseResult | null>(null);


  const handleManualNameChange = (fileId: string, name: string) => {
    setManualNamesForFailedImages(prev => ({ ...prev, [fileId]: name }));
  };

  const resetToInitialState = () => {
    setPhase('initial');
    setIsLoading(false);
    setError(null);
    // setGeneralManualCoursesInput(''); // Optionally keep if user wants to re-run
    setOcrSuccessfullyExtracted([]);
    setOcrFailedImages([]);
    setManualNamesForFailedImages({});
    setFinalResult(null);
    setAssociatedImageFileIdsForResults([]);
  };

  const handlePrimaryButtonClick = useCallback(async () => {
    if (!userId) {
      toast({ title: 'Authentication Required', variant: 'destructive' });
      return;
    }
    // If already loading (e.g. from processingSuggestions phase), do nothing.
    if (isLoading && phase === 'processingSuggestions') return;


    setIsLoading(true);
    setError(null);
    const endpoint = `${flaskServerBaseUrl}/api/process-certificates`;

    if (phase === 'initial' || phase === 'results') { // Start or restart OCR phase
      resetToInitialState(); // Clear everything for a fresh start or restart
      setPhase('initial'); // Explicitly set to initial if restarting from results
      
      const generalManualCourses = generalManualCoursesInput.split(',').map(c => c.trim()).filter(c => c.length > 0);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId, 
            mode: 'ocr_only', 
            additionalManualCourses: generalManualCourses 
          }),
        });
        const data: OcrPhaseResult = await response.json();
        setIsLoading(false); // OCR phase done

        if (!response.ok || data.error) {
          throw new Error(data.error || `Server error: ${response.status}`);
        }
        
        setOcrSuccessfullyExtracted(data.successfully_extracted_courses || []);
        setOcrFailedImages(data.failed_extraction_images || []);
        // `processed_image_file_ids` from OCR result might be useful later if we want to show *all* images OCR'd
        // For now, `associated_image_file_ids` will be populated by the suggestions phase response.

        if (data.failed_extraction_images && data.failed_extraction_images.length > 0) {
          setPhase('manualNaming');
          toast({
            title: 'Action Required',
            description: `${data.failed_extraction_images.length} certificate(s) couldn't be read. Please name them below.`,
            duration: 7000
          });
        } else if ((data.successfully_extracted_courses && data.successfully_extracted_courses.length > 0) || generalManualCourses.length > 0) {
          setPhase('processingSuggestions'); // Intermediate state
          // Automatically trigger the suggestions phase since there are courses to process
          // Using a brief timeout to allow state updates before re-calling
          setTimeout(() => handlePrimaryButtonClick(), 0);
        } else {
          toast({ title: 'Nothing to Process', description: data.message || 'No courses extracted and no manual courses provided.' });
          setPhase('initial'); 
        }

      } catch (err: any) {
        setIsLoading(false);
        setError(err.message || 'Failed OCR phase.');
        toast({ title: 'OCR Phase Failed', description: err.message, variant: 'destructive' });
        setPhase('initial');
      }

    } else if (phase === 'manualNaming' || phase === 'processingSuggestions') { // Trigger suggestions phase (Phase 2)
      // Ensure `isLoading` is true for this part if it wasn't already (e.g. coming from manualNaming)
      if (phase === 'manualNaming') setIsLoading(true); // If triggered by user click from manualNaming
      setPhase('processingSuggestions'); // Ensure phase is set

      const userProvidedNamesForFailures = Object.values(manualNamesForFailedImages).map(name => name.trim()).filter(name => name.length > 0);
      const generalManualCourses = generalManualCoursesInput.split(',').map(c => c.trim()).filter(c => c.length > 0);
      
      const allKnownCourses = [
        ...new Set([
          ...ocrSuccessfullyExtracted, 
          ...userProvidedNamesForFailures,
          ...generalManualCourses
        ])
      ].filter(name => name.length > 0); 

      if (allKnownCourses.length === 0) {
        toast({ title: 'No Courses', description: 'No courses available to get suggestions for.', variant: 'destructive' });
        setIsLoading(false);
        setPhase(ocrFailedImages.length > 0 ? 'manualNaming' : 'initial'); 
        return;
      }

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId, 
            mode: 'suggestions_only', 
            knownCourseNames: allKnownCourses
          }),
        });
        const data: SuggestionsPhaseResult = await response.json();
        setIsLoading(false); // Suggestions phase done

        if (!response.ok || data.error) {
          throw new Error(data.error || `Server error: ${response.status}`);
        }

        setFinalResult(data);
        setAssociatedImageFileIdsForResults(data.associated_image_file_ids || []);
        setPhase('results');

        if (data.user_processed_data && data.user_processed_data.length > 0) {
          toast({ title: 'Suggestions Generated', description: `AI suggestions and descriptions generated for ${data.user_processed_data.length} course(s).` });
        } else if (data.message) {
           toast({ title: 'Processing Info', description: data.message });
        }
        if (data.llm_error_summary) {
          toast({ title: "LLM Warning", description: data.llm_error_summary, variant: "destructive", duration: 7000 });
        }

      } catch (err: any) {
        setIsLoading(false);
        setError(err.message || 'Failed suggestions phase.');
        toast({ title: 'Suggestions Phase Failed', description: err.message, variant: 'destructive' });
        setPhase(ocrFailedImages.length > 0 ? 'manualNaming' : 'initial'); 
      }
    }
  }, [userId, flaskServerBaseUrl, phase, generalManualCoursesInput, ocrSuccessfullyExtracted, ocrFailedImages, manualNamesForFailedImages, toast, isLoading]);


  let buttonText = "Process Certificates for OCR";
  let ButtonIconComponent = ListChecks; // Use a variable for the component type
  if (phase === 'manualNaming') {
    buttonText = "Proceed with AI Suggestions";
    ButtonIconComponent = Wand2;
  } else if (phase === 'processingSuggestions') {
    buttonText = "Generating Suggestions...";
    ButtonIconComponent = Loader2; 
  } else if (phase === 'results') {
    buttonText = "Start New Processing";
    ButtonIconComponent = ListChecks;
  }

  return (
    <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8 flex flex-col h-[calc(100vh-var(--header-height,4rem)-1px)]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon" aria-label="Go back to Home">
            <Link href="/"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <h1 className="text-3xl font-bold font-headline">Certificate Insights & Recommendations</h1>
        </div>
      </div>
      
      <p className="mb-4 text-muted-foreground">
        Upload certificates on the home page. This tool processes them in two steps:
        1. OCR to extract text. 2. AI suggestions for identified courses.
      </p>

      { (phase === 'initial' || phase === 'manualNaming') && (
        <div className="space-y-2 mb-6">
          <Label htmlFor="generalManualCourses">Manually Add General Courses (comma-separated, processed with others)</Label>
          <Textarea
            id="generalManualCourses"
            placeholder="e.g., Advanced Python, Introduction to Docker"
            value={generalManualCoursesInput}
            onChange={(e) => setGeneralManualCoursesInput(e.target.value)}
            className="min-h-[80px]"
            disabled={isLoading || phase === 'processingSuggestions' || phase === 'results'}
          />
        </div>
      )}

      {/* Main Action Button - always visible unless in results phase and no results */}
      { (phase !== 'results' || (phase === 'results' && finalResult)) && (
          <Button 
            onClick={handlePrimaryButtonClick} 
            disabled={isLoading || !user || (phase === 'processingSuggestions' && isLoading) } 
            className="w-full sm:w-auto mb-6"
          >
            <ButtonIconComponent className={`mr-2 h-4 w-4 ${(isLoading && phase === 'processingSuggestions') ? 'animate-spin' : ''}`} />
            {buttonText}
          </Button>
        )
      }
      {!user && <p className="text-sm text-destructive mb-6">Please log in to process certificates.</p>}
      {error && (
        <Card className="mb-6 border-destructive bg-destructive/10">
          <CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2"/>Error</CardTitle></CardHeader>
          <CardContent><p>{error}</p></CardContent>
        </Card>
      )}

      {/* --- Phase: Manual Naming for OCR Failures --- */}
      {phase === 'manualNaming' && ocrFailedImages.length > 0 && (
        <Card className="my-6 border-amber-500 bg-amber-500/10">
          <CardHeader>
            <CardTitle className="text-xl font-headline text-amber-700 flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5" /> Name Unidentified Certificates
            </CardTitle>
            <CardDescription>
              OCR failed for {ocrFailedImages.length} image(s). Please provide the course name for each.
              These names will be used to get AI suggestions.
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
                   ) : (
                     <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">No Preview (ID missing)</div>
                   )}
                </div>
                <div className="flex-grow space-y-1 w-full sm:w-auto">
                  <p className="text-xs font-semibold text-muted-foreground truncate" title={img.original_filename}>{img.original_filename}</p>
                  {img.reason && <p className="text-xs text-amber-600 italic">Reason: {img.reason}</p>}
                  <Input
                    type="text"
                    placeholder="Enter course name for this image"
                    value={manualNamesForFailedImages[img.file_id] || ''}
                    onChange={(e) => handleManualNameChange(img.file_id, e.target.value)}
                    className="w-full mt-1"
                    aria-label={`Manual course name for ${img.original_filename}`}
                    disabled={isLoading}
                  />
                </div>
              </div>
            ))}
          </CardContent>
           <CardFooter>
            <Button 
              onClick={handlePrimaryButtonClick} 
              disabled={isLoading || !user || (phase === 'processingSuggestions' && isLoading)} 
              className="w-full"
            >
              <ButtonIconComponent className={`mr-2 h-4 w-4 ${(isLoading && phase === 'processingSuggestions') ? 'animate-spin' : ''}`} />
              {buttonText} {/* This will be "Proceed with AI Suggestions" in this phase */}
            </Button>
          </CardFooter>
        </Card>
      )}
      
      {/* Displaying Successfully OCR'd courses during manualNaming phase for context */}
      {phase === 'manualNaming' && ocrSuccessfullyExtracted.length > 0 && (
        <Card className="mb-6 border-green-500 bg-green-500/10">
            <CardHeader>
                <CardTitle className="text-lg font-headline text-green-700 flex items-center">
                    <CheckCircle className="mr-2 h-5 w-5" /> Successfully OCR'd Courses
                </CardTitle>
                <CardDescription>
                    These courses were identified by OCR and will be included when you proceed to get AI suggestions.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ul className="list-disc pl-5 text-sm text-green-700">
                    {ocrSuccessfullyExtracted.map(course => <li key={course}>{course}</li>)}
                </ul>
            </CardContent>
        </Card>
      )}


      {/* --- Phase: Results Display Area --- */}
      {phase === 'results' && finalResult && (
        <div className="flex-grow border border-border rounded-lg shadow-md overflow-y-auto p-4 bg-card space-y-6">
          <h2 className="text-2xl font-headline mb-4 border-b pb-2">Processed Result & AI Suggestions:</h2>
          
          {associatedImageFileIdsForResults.length > 0 && ( 
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 font-headline">Certificate Images Considered in this Run:</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {associatedImageFileIdsForResults.map(fileId => (
                  <div key={`processed-${fileId}`} className="aspect-[4/3] relative rounded-md overflow-hidden border shadow-sm">
                    <NextImage 
                      src={`/api/images/${fileId}`} alt={`Processed certificate image ${fileId}`}
                      fill sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                      className="object-contain" data-ai-hint="certificate image"
                    />
                     <a href={`/api/images/${fileId}`} target="_blank" rel="noopener noreferrer" className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full hover:bg-black/70 transition-colors" title="Open image in new tab">
                       <ExternalLink className="w-3 h-3"/>
                     </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {finalResult.message && !finalResult.user_processed_data?.length && (
            <Card className="bg-blue-500/10 border-blue-500">
              <CardHeader className="flex-row items-center gap-2"><Info className="w-5 h-5 text-blue-700" /><CardTitle className="text-blue-700 text-lg">Information</CardTitle></CardHeader>
              <CardContent><p className="text-blue-700">{finalResult.message}</p></CardContent>
            </Card>
          )}
          
          {finalResult.llm_error_summary && (
             <Card className="border-amber-500 bg-amber-500/10">
              <CardHeader className="flex-row items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-700" /><CardTitle className="text-amber-700 text-lg">LLM Warning</CardTitle></CardHeader>
              <CardContent><p className="text-amber-700">{finalResult.llm_error_summary}</p></CardContent>
            </Card>
          )}

          {finalResult.user_processed_data && finalResult.user_processed_data.length > 0 ? (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold font-headline">Identified Courses & AI Suggestions:</h3>
              {finalResult.user_processed_data.map((identifiedCourseData, index) => (
                <Card key={`identified-${index}`} className="bg-background/50 shadow-inner">
                  <CardHeader>
                    <CardTitle className="text-xl font-headline text-primary">
                      {identifiedCourseData.identified_course_name}
                    </CardTitle>
                    {identifiedCourseData.ai_description && ( // Prefer AI description first
                      <CardDescription className="pt-1 text-sm">AI Description: {identifiedCourseData.ai_description}</CardDescription>
                    )}
                    {identifiedCourseData.description_from_graph && !identifiedCourseData.ai_description && ( // Show graph desc if no AI desc
                      <CardDescription className="pt-1 text-sm italic">Graph Description: {identifiedCourseData.description_from_graph}</CardDescription>
                    )}
                     {!identifiedCourseData.ai_description && !identifiedCourseData.description_from_graph && (
                        <CardDescription className="pt-1 text-sm italic">No description available for this course.</CardDescription>
                     )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <h4 className="font-semibold text-md">AI Suggested Next Steps:</h4>
                    {identifiedCourseData.llm_suggestions && identifiedCourseData.llm_suggestions.length > 0 ? (
                      <ul className="space-y-3 list-none pl-0">
                        {identifiedCourseData.llm_suggestions.map((suggestion, sugIndex) => (
                          <li key={`sug-${index}-${sugIndex}`} className="border p-3 rounded-md bg-card shadow-sm">
                            <p className="font-medium text-base">{suggestion.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">{suggestion.description}</p>
                            {suggestion.url && (
                              <Button variant="link" size="sm" asChild className="px-0 h-auto text-primary hover:text-primary/80">
                                <a href={suggestion.url} target="_blank" rel="noopener noreferrer">
                                  Learn more <ExternalLink className="ml-1 h-3 w-3" />
                                </a>
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : identifiedCourseData.llm_error ? (
                       <p className="text-sm text-amber-700 italic">Note: {identifiedCourseData.llm_error}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No specific AI suggestions available for this item.</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            phase === 'results' && <p className="text-muted-foreground italic">No comprehensive suggestions were generated in this run.</p>
          )}
          <div className="mt-6 pt-4 border-t">
            <Label htmlFor="rawJsonOutput" className="text-xs text-muted-foreground">Raw JSON Output (for debugging):</Label>
            <Textarea id="rawJsonOutput" readOnly value={JSON.stringify(finalResult, null, 2)}
              className="w-full h-auto min-h-[150px] text-xs font-code bg-muted/30 resize-none mt-1"
              aria-label="Raw processing result JSON"
            />
          </div>
        </div>
      )}
       <p className="mt-4 text-xs text-muted-foreground">
        Note: Ensure Flask server URL is correct and backend services (DB, AI) are operational.
      </p>
    </div>
  );
}

export default function AiFeaturePage() {
  return (
    <ProtectedPage>
      <AiFeaturePageContent />
    </ProtectedPage>
  );
}
