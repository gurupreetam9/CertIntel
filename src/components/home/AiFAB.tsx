'use client';

import Link from 'next/link';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export default function AiFAB() {
  const { user } = useAuth();

  if (!user) return null;
  
  return (
    <Link href="/ai-feature" passHref legacyBehavior>
      <Button
        variant="default"
        size="icon"
        className="fixed bottom-6 right-6 md:bottom-8 md:right-28 h-14 w-14 rounded-full shadow-xl z-40 bg-accent hover:bg-accent/90 text-accent-foreground"
        aria-label="AI Features"
      >
        <Bot className="h-7 w-7" />
      </Button>
    </Link>
  );
}
