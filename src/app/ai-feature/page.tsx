
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface CertificateProcessingResult {
  courses?: any[]; // Define a more specific type if you know the structure
  error?: string;
}

function AiFeaturePageContent() {
  const flaskServerBaseUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL || 'http://localhost:5000';
  const [folderPath, setFolderPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<CertificateProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleProcessCertificates = async () => {
    if (!folderPath.trim()) {
      toast({
        title: 'Input Required',
        description: 'Please enter a folder path.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setResult(null);
    setError(null);
    const endpoint = `${flaskServerBaseUrl}/api/process-certificates`;

    try {
      console.log(`Attempting to POST to: ${endpoint} with folder: ${folderPath}`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ folder: folderPath }),
      });

      const responseData: CertificateProcessingResult = await response.json();
      console.log('Response from Flask server:', responseData);

      if (!response.ok) {
        const errorMessage = responseData?.error || `Server error: ${response.status}`;
        throw new Error(errorMessage);
      }
      
      setResult(responseData);
      if (responseData.courses) {
         toast({
          title: 'Processing Successful',
          description: `Found ${responseData.courses.length} course(s).`,
        });
      } else if (responseData.error) {
         toast({
          title: 'Processing Error from Server',
          description: responseData.error,
          variant: 'destructive',
        });
        setError(responseData.error);
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
          <h1 className="text-3xl font-bold font-headline">Certificate Processing AI</h1>
        </div>
      </div>
      
      <p className="mb-4 text-muted-foreground">
        Enter the absolute folder path (on the server where your Python AI model is running) containing the certificates you want to process.
        Your AI server is expected at: <code className="bg-muted px-1 py-0.5 rounded-sm font-code">{flaskServerBaseUrl}</code>.
      </p>

      <div className="space-y-4 mb-6">
        <div>
          <Label htmlFor="folderPath" className="text-sm font-medium">
            Server Folder Path
          </Label>
          <Input
            id="folderPath"
            type="text"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="/path/to/certificates/on/server"
            className="mt-1"
            disabled={isLoading}
          />
        </div>
        <Button onClick={handleProcessCertificates} disabled={isLoading} className="w-full sm:w-auto">
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Process Certificates
        </Button>
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
          <Textarea
            readOnly
            value={JSON.stringify(result, null, 2)}
            className="w-full h-full min-h-[200px] text-sm font-code bg-muted/30 resize-none"
            aria-label="Processing result JSON"
          />
        </div>
      )}
       <p className="mt-4 text-xs text-muted-foreground">
        Note: If requests fail, please verify the Flask server URL in your <code className="font-code">.env.local</code> file (NEXT_PUBLIC_FLASK_SERVER_URL), ensure the server is running, accessible, and CORS is configured if necessary.
        Also, ensure the folder path provided is valid on the Flask server.
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
