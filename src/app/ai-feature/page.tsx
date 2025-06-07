
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { Button } from '@/components/ui/button';
// Input removed as folder_path is no longer directly entered by user on this page for Scenario A
// import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label'; // Kept if we add other labels later
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'; // Changed Send to Sparkles
import Link from 'next/link';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth'; // Import useAuth to get userId

// Interface for the expected structure from your Flask API (Scenario A)
interface CertificateProcessingResult {
  extracted_courses?: string[];
  recommendations?: Array<{
    type: string;
    completed_course?: string;
    matched_course?: string;
    similarity_score?: number;
    description?: string;
    next_courses?: string[];
    url?: string;
    based_on_courses?: string[];
    name?: string; // For LLM recommendations
    message?: string; // For LLM errors
  }>;
  error?: string; // For general errors from Flask
  message?: string; // For informational messages from Flask (e.g., no certs found)
}

function AiFeaturePageContent() {
  const flaskServerBaseUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL || 'http://localhost:5000';
  // folderPath state removed, not needed for Scenario A on frontend
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<CertificateProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { userId, user } = useAuth(); // Get userId and user

  const handleProcessUserCertificates = async () => {
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
    // The endpoint in your Flask app that expects a userId
    const endpoint = `${flaskServerBaseUrl}/api/process-certificates`; 

    try {
      console.log(`Attempting to POST to: ${endpoint} with userId: ${userId}`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Send userId in the body
        body: JSON.stringify({ userId: userId }),
      });

      const responseData: CertificateProcessingResult = await response.json();
      console.log('Response from Flask server:', responseData);

      if (!response.ok) {
        const errorMessage = responseData?.error || `Server error: ${response.status} - ${response.statusText}`;
        throw new Error(errorMessage);
      }
      
      setResult(responseData);

      if (responseData.error) {
        toast({
          title: 'Processing Error from Server',
          description: responseData.error,
          variant: 'destructive',
        });
        setError(responseData.error);
      } else if (responseData.message && !responseData.extracted_courses?.length) {
         toast({ // Informational, e.g. "No certificates found"
          title: 'Processing Info',
          description: responseData.message,
        });
      } else if (responseData.extracted_courses || responseData.recommendations) {
         toast({
          title: 'Processing Successful',
          description: `Found ${responseData.extracted_courses?.length || 0} course(s) and ${responseData.recommendations?.length || 0} recommendation(s).`,
        });
      }

    } catch (err: any) {
      console.error('Error calling Flask API:', err);
      const displayError = err.message || 'Failed to connect to the AI service. Ensure it is running and accessible.';
      setError(displayError);
      toast({
        title: 'API Call Failed',
        description: displayError,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8 flex flex-col h-[calc(100vh-var(--header-height,4rem))]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon" aria-label="Go back to Home">
            <Link href="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold font-headline">Certificate Insights & Recommendations</h1>
        </div>
      </div>
      
      <p className="mb-4 text-muted-foreground">
        Click the button below to process all your uploaded certificates using our AI model. 
        The model will extract course names and suggest next learning steps.
        Your AI server is expected at: <code className="bg-muted px-1 py-0.5 rounded-sm font-code">{flaskServerBaseUrl}</code>.
      </p>

      <div className="space-y-4 mb-6">
        {/* Input for folderPath removed */}
        <Button onClick={handleProcessUserCertificates} disabled={isLoading || !user} className="w-full sm:w-auto">
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Process My Certificates
        </Button>
         {!user && <p className="text-sm text-destructive">Please log in to process certificates.</p>}
      </div>

      {error && (
        <div className="p-4 mb-4 text-sm text-destructive-foreground bg-destructive rounded-md">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="flex-grow border border-border rounded-lg shadow-md overflow-hidden p-4 bg-card">
          <h2 className="text-xl font-headline mb-2">Processing Result:</h2>
          {/* Basic rendering of results, can be improved significantly */}
          <div className="space-y-4 max-h-[50vh] overflow-y-auto">
            {result.message && !result.extracted_courses?.length && (
                <p className="text-muted-foreground">{result.message}</p>
            )}
            {result.extracted_courses && result.extracted_courses.length > 0 && (
              <div>
                <h3 className="font-semibold text-lg">Extracted Courses/Topics:</h3>
                <ul className="list-disc list-inside pl-2">
                  {result.extracted_courses.map((course, index) => (
                    <li key={`extracted-${index}`} className="text-sm">{course}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.recommendations && result.recommendations.length > 0 && (
              <div>
                <h3 className="font-semibold text-lg mt-4">Recommendations:</h3>
                {result.recommendations.map((rec, index) => (
                  <div key={`rec-${index}`} className="border-b py-2">
                    <p className="text-sm"><strong>Type:</strong> {rec.type}</p>
                    {rec.name && <p className="text-sm"><strong>Course:</strong> {rec.name}</p>}
                    {rec.completed_course && <p className="text-sm"><strong>Based on:</strong> {rec.completed_course}</p>}
                    {rec.matched_course && <p className="text-sm"><strong>Matched Graph Course:</strong> {rec.matched_course} (Score: {rec.similarity_score})</p>}
                    {rec.description && <p className="text-sm"><strong>Description:</strong> {rec.description}</p>}
                    {rec.next_courses && rec.next_courses.length > 0 && (
                      <p className="text-sm"><strong>Suggested Next:</strong> {rec.next_courses.join(", ")}</p>
                    )}
                    {rec.url && <p className="text-sm"><strong>URL:</strong> <a href={rec.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{rec.url}</a></p>}
                     {rec.message && <p className="text-sm text-muted-foreground"><strong>Note:</strong> {rec.message}</p>}
                  </div>
                ))}
              </div>
            )}
             <Textarea
              readOnly
              value={JSON.stringify(result, null, 2)}
              className="w-full h-auto min-h-[100px] text-xs font-code bg-muted/30 resize-none mt-4"
              aria-label="Raw processing result JSON"
            />
          </div>
        </div>
      )}
       <p className="mt-4 text-xs text-muted-foreground">
        Note: If requests fail, please verify the Flask server URL in your <code className="font-code">.env.local</code> file (NEXT_PUBLIC_FLASK_SERVER_URL), ensure the server is running, accessible, and CORS is configured if necessary.
        Also ensure your Flask server can connect to MongoDB using the MONGODB_URI environment variable.
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
