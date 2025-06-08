
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Sparkles, ExternalLink, AlertTriangle, Info } from 'lucide-react';
import NextImage from 'next/image';
import Link from 'next/link';
import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface LLMSuggestion {
  name: string;
  description: string;
  url: string;
}

interface UserProcessedCourseData {
  identified_course_name: string;
  description_from_graph?: string | null;
  llm_suggestions: LLMSuggestion[];
  llm_error?: string | null;
}

interface FailedExtractionImage {
  file_id: string;
  original_filename: string;
  reason?: string; // Optional reason for failure
}

interface CertificateProcessingResult {
  user_processed_data?: UserProcessedCourseData[];
  processed_image_file_ids?: string[];
  failed_extraction_images?: FailedExtractionImage[];
  llm_error_summary?: string | null; // Overall LLM error
  error?: string; // Global error for the whole request
  message?: string; // Global message for the whole request
}

function AiFeaturePageContent() {
  const flaskServerBaseUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL || 'http://localhost:5000';
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<CertificateProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualCoursesInput, setManualCoursesInput] = useState<string>('');
  const { toast } = useToast();
  const { userId, user } = useAuth();

  const [imagesForManualNaming, setImagesForManualNaming] = useState<FailedExtractionImage[] | null>(null);
  const [manualNamesForImages, setManualNamesForImages] = useState<{ [key: string]: string }>({});

  const handleManualNameChange = (fileId: string, name: string) => {
    setManualNamesForImages(prev => ({ ...prev, [fileId]: name }));
  };

  const handleProcessUserCertificates = useCallback(async () => {
    if (!userId) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to process your certificates.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setResult(null);
    setError(null);
    setImagesForManualNaming(null); // Clear previous failed images UI

    const endpoint = `${flaskServerBaseUrl}/api/process-certificates`;

    const generalManualCourses = manualCoursesInput
      .split(',')
      .map(course => course.trim())
      .filter(course => course.length > 0);
    
    const specificManualNamesForFailedImages = Object.values(manualNamesForImages)
      .map(name => name.trim())
      .filter(name => name.length > 0);
      
    const combinedManualCourses = [...new Set([...generalManualCourses, ...specificManualNamesForFailedImages])];
    // Important: Clear specific manual names for next round, general input remains
    setManualNamesForImages({}); 


    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, additionalManualCourses: combinedManualCourses }),
      });

      const responseData: CertificateProcessingResult = await response.json();
      console.log('Response from Flask server (manual naming structure):', responseData);

      if (!response.ok) {
        const errorMessage = responseData?.error || `Server error: ${response.status}`;
        throw new Error(errorMessage);
      }
      
      setResult(responseData);

      if (responseData.failed_extraction_images && responseData.failed_extraction_images.length > 0) {
        setImagesForManualNaming(responseData.failed_extraction_images);
        toast({
          title: 'Action Required',
          description: `${responseData.failed_extraction_images.length} certificate(s) could not be automatically identified. Please name them manually below.`,
          variant: 'default',
          duration: 7000,
        });
      }

      if (responseData.error) {
        toast({ title: 'Processing Error', description: responseData.error, variant: 'destructive' });
        setError(responseData.error);
      } else if (responseData.message && !responseData.user_processed_data?.length && !imagesForManualNaming?.length) {
         toast({ title: 'Processing Info', description: responseData.message });
      } else if (responseData.user_processed_data?.length) {
         toast({ title: 'Processing Successful', description: `Processed ${responseData.user_processed_data.length} identified course(s)/topic(s).` });
      }
      if (responseData.llm_error_summary) {
        toast({title: "LLM Warning", description: responseData.llm_error_summary, variant: "destructive", duration: 7000});
      }

    } catch (err: any) {
      const displayError = err.message || 'Failed to connect to the AI service.';
      setError(displayError);
      toast({ title: 'API Call Failed', description: displayError, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [userId, flaskServerBaseUrl, manualCoursesInput, manualNamesForImages, toast]);

  return (
    <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8 flex flex-col h-[calc(100vh-var(--header-height,4rem))]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon" aria-label="Go back to Home">
            <Link href="/"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <h1 className="text-3xl font-bold font-headline">Certificate Insights & Recommendations</h1>
        </div>
      </div>
      
      <p className="mb-4 text-muted-foreground">
        Process uploaded certificates to extract course names and get AI-powered learning suggestions.
        Add any missed courses manually below (comma-separated). Server: <code className="font-code">{flaskServerBaseUrl}</code>.
      </p>

      <div className="space-y-4 mb-6">
        <div className="space-y-2">
          <Label htmlFor="manualCourses">Manually Add Courses (comma-separated)</Label>
          <Textarea
            id="manualCourses"
            placeholder="e.g., Advanced Python, Introduction to Docker"
            value={manualCoursesInput}
            onChange={(e) => setManualCoursesInput(e.target.value)}
            className="min-h-[80px]"
          />
        </div>
        <Button onClick={handleProcessUserCertificates} disabled={isLoading || !user} className="w-full sm:w-auto">
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Process My Certificates
        </Button>
         {!user && <p className="text-sm text-destructive">Please log in to process certificates.</p>}
      </div>

      {error && (
        <Card className="mb-6 border-destructive bg-destructive/10">
          <CardHeader><CardTitle className="text-destructive">Error</CardTitle></CardHeader>
          <CardContent><p>{error}</p></CardContent>
        </Card>
      )}

      {imagesForManualNaming && imagesForManualNaming.length > 0 && (
        <Card className="my-6 border-amber-500 bg-amber-500/10">
          <CardHeader>
            <CardTitle className="text-xl font-headline text-amber-700 flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5" /> Name Unidentified Certificates
            </CardTitle>
            <CardDescription>
              We couldn&apos;t automatically identify the course names from the following certificate images. 
              Please enter the course name for each, then click &quot;Process My Certificates&quot; again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-h-96 overflow-y-auto pr-2">
            {imagesForManualNaming.map(img => (
              <div key={img.file_id} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-3 border rounded-md bg-background/50">
                <div className="relative w-full sm:w-24 h-32 sm:h-24 rounded-md overflow-hidden shrink-0 border shadow-sm">
                   <NextImage 
                    src={`/api/images/${img.file_id}`} 
                    alt={`Certificate: ${img.original_filename}`}
                    fill
                    sizes="(max-width: 640px) 100vw, 96px"
                    className="object-contain"
                    data-ai-hint="certificate needs naming"
                   />
                </div>
                <div className="flex-grow space-y-1 w-full sm:w-auto">
                  <p className="text-xs font-medium text-muted-foreground truncate" title={img.original_filename}>{img.original_filename}</p>
                  <Input
                    type="text"
                    placeholder="Enter course name for this image"
                    value={manualNamesForImages[img.file_id] || ''}
                    onChange={(e) => handleManualNameChange(img.file_id, e.target.value)}
                    className="w-full"
                  />
                  {img.reason && <p className="text-xs text-amber-600 italic mt-1">Note: {img.reason}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="flex-grow border border-border rounded-lg shadow-md overflow-y-auto p-4 bg-card space-y-6">
          <h2 className="text-2xl font-headline mb-4 border-b pb-2">Processing Result:</h2>
          
          {result.processed_image_file_ids && result.processed_image_file_ids.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-3 font-headline">Processed Certificate Images This Run:</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {result.processed_image_file_ids.map(fileId => (
                  <div key={`processed-${fileId}`} className="aspect-[4/3] relative rounded-md overflow-hidden border shadow-sm">
                    <NextImage 
                      src={`/api/images/${fileId}`} 
                      alt={`Processed certificate image ${fileId}`}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                      className="object-contain"
                      data-ai-hint="certificate image"
                    />
                     <a href={`/api/images/${fileId}`} target="_blank" rel="noopener noreferrer" className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full hover:bg-black/70 transition-colors" title="Open image in new tab">
                       <ExternalLink className="w-3 h-3"/>
                     </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.message && !result.user_processed_data?.length && !imagesForManualNaming?.length && (
            <Card className="bg-blue-500/10 border-blue-500">
              <CardHeader className="flex-row items-center gap-2">
                <Info className="w-5 h-5 text-blue-700" />
                <CardTitle className="text-blue-700 text-lg">Information</CardTitle>
              </CardHeader>
              <CardContent><p className="text-blue-700">{result.message}</p></CardContent>
            </Card>
          )}
          
          {result.llm_error_summary && (
             <Card className="border-amber-500 bg-amber-500/10">
              <CardHeader className="flex-row items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-700" />
                <CardTitle className="text-amber-700 text-lg">LLM Warning</CardTitle>
              </CardHeader>
              <CardContent><p className="text-amber-700">{result.llm_error_summary}</p></CardContent>
            </Card>
          )}


          {result.user_processed_data && result.user_processed_data.length > 0 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold font-headline">Identified Courses & AI Suggestions:</h3>
              {result.user_processed_data.map((identifiedCourseData, index) => (
                <Card key={`identified-${index}`} className="bg-background/50 shadow-inner">
                  <CardHeader>
                    <CardTitle className="text-xl font-headline text-primary">
                      {identifiedCourseData.identified_course_name}
                    </CardTitle>
                    {identifiedCourseData.description_from_graph && (
                      <CardDescription className="pt-1 text-sm">
                        {identifiedCourseData.description_from_graph}
                      </CardDescription>
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
          )}
          <div className="mt-6 pt-4 border-t">
            <Label htmlFor="rawJsonOutput" className="text-xs text-muted-foreground">Raw JSON Output:</Label>
            <Textarea
              id="rawJsonOutput"
              readOnly
              value={JSON.stringify(result, null, 2)}
              className="w-full h-auto min-h-[150px] text-xs font-code bg-muted/30 resize-none mt-1"
              aria-label="Raw processing result JSON"
            />
          </div>
        </div>
      )}
       <p className="mt-4 text-xs text-muted-foreground">
        Note: Verify Flask server URL in <code className="font-code">.env.local</code> and ensure server/DB connectivity.
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
    

    