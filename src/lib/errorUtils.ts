/**
 * Maps raw error objects/messages to clean, user-friendly strings.
 * Keeps technical details out of the UI while logging them to console.
 */
export function getUserFriendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  // Log the raw error for developer debugging
  console.error('[CertIntel] Raw error:', raw);

  const lower = raw.toLowerCase();

  // Network / connection errors (fetch fails entirely, server is down)
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('err_connection_refused') ||
    lower.includes('econnrefused') ||
    lower.includes('communicating')
  ) {
    return 'Services are not available right now. Please try again later.';
  }

  // HTTP status-based errors
  if (lower.includes('503') || lower.includes('service unavailable') || lower.includes('maintenance')) {
    return 'Services are not available right now. Please try again later.';
  }
  if (lower.includes('500') || lower.includes('internal server error') || lower.includes('server error')) {
    return 'Something went wrong. Please try again later.';
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('session') || lower.includes('expired')) {
    return 'Your session has expired. Please log in again.';
  }
  if (lower.includes('403') || lower.includes('forbidden') || lower.includes('permission')) {
    return 'You don\'t have permission to do this.';
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return 'This content is no longer available.';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'This is taking too long. Please try again.';
  }
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Fallback — keep it simple
  return 'Something went wrong. Please try again later.';
}
