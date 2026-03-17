'use client';

import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, WifiOff, RefreshCw, ServerCrash } from 'lucide-react';

interface ErrorCardProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  variant?: 'connection' | 'server' | 'default';
  className?: string;
}

export default function ErrorCard({
  title,
  message,
  onRetry,
  variant = 'default',
  className = '',
}: ErrorCardProps) {
  const isConnection =
    variant === 'connection' ||
    message.toLowerCase().includes('connection') ||
    message.toLowerCase().includes('unavailable');

  const isServer =
    variant === 'server' ||
    message.toLowerCase().includes('server') ||
    message.toLowerCase().includes('maintenance');

  const Icon = isConnection ? WifiOff : isServer ? ServerCrash : AlertTriangle;

  const defaultTitle = isConnection
    ? 'Connection Issue'
    : isServer
      ? 'Server Issue'
      : 'Something Went Wrong';

  const displayTitle = title || defaultTitle;

  return (
    <Card
      className={`overflow-hidden border-destructive/30 ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 via-transparent to-destructive/10 pointer-events-none rounded-xl" />
      <CardContent className="relative pt-8 pb-4 flex flex-col items-center text-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-destructive/20 rounded-full blur-xl scale-150" />
          <div className="relative w-16 h-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <Icon className="h-8 w-8 text-destructive animate-pulse" />
          </div>
        </div>

        <div className="space-y-2 max-w-md">
          <h3 className="text-lg font-semibold text-foreground">
            {displayTitle}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {message}
          </p>
        </div>
      </CardContent>

      {onRetry && (
        <CardFooter className="relative justify-center pb-6">
          <Button
            onClick={onRetry}
            variant="outline"
            className="gap-2 border-destructive/20 hover:bg-destructive/5 hover:border-destructive/40 transition-all"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
