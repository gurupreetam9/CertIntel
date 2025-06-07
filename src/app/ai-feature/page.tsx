'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

function AiFeaturePageContent() {
  const flaskServerUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL || 'http://localhost:5000/your_ai_endpoint';

  return (
    <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8 flex flex-col h-[calc(100vh-var(--header-height,4rem))]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
           <Link href="/" passHref legacyBehavior>
            <Button variant="outline" size="icon" aria-label="Go back to Home">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold font-headline">AI Powered Feature</h1>
        </div>
      </div>
      
      <p className="mb-4 text-muted-foreground">
        The content below is loaded from an external AI service. 
        Ensure your Flask server is running at: <code className="bg-muted px-1 py-0.5 rounded-sm font-code">{flaskServerUrl}</code>.
      </p>

      <div className="flex-grow border border-border rounded-lg shadow-md overflow-hidden">
        <iframe
          src={flaskServerUrl}
          title="AI Feature Content"
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms" // Adjust sandbox permissions as needed
        />
      </div>
       <p className="mt-4 text-xs text-muted-foreground">
        Note: If the content doesn&apos;t load, please verify the Flask server URL in your <code className="font-code">.env.local</code> file (NEXT_PUBLIC_FLASK_SERVER_URL) and ensure the server is running and accessible.
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
