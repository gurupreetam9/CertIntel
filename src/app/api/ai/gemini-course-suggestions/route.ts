import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  generateCourseSuggestionsGemini,
  type GeminiCourseSuggestionInput,
  type GeminiCourseSuggestionOutput,
} from '@/ai/flows/generate-course-suggestions-gemini';
import { GeminiCourseSuggestionInputSchema } from '@/ai/schemas/course-suggestion-schemas';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsedBody = GeminiCourseSuggestionInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body for Gemini suggestions', errors: parsedBody.error.format() },
        { status: 400 }
      );
    }

    const input: GeminiCourseSuggestionInput = parsedBody.data;

    console.log(
      `API /api/ai/gemini-course-suggestions: Calling Genkit flow for course: ${input.courseName}`
    );

    const result: GeminiCourseSuggestionOutput = await generateCourseSuggestionsGemini(input);

    // The flow itself should return a valid structure, even on error, as per its definition.
    // If result is null/undefined here, it means a more fundamental Genkit/flow error.
    if (!result) {
        console.error(`API /api/ai/gemini-course-suggestions: Genkit flow returned null/undefined for course: ${input.courseName}`);
        return NextResponse.json(
            { message: 'AI did not return valid suggestion data (flow error).' },
            { status: 500 }
        );
    }
    
    return NextResponse.json(result, { status: 200 });

  } catch (error: any) {
    console.error(
      'API /api/ai/gemini-course-suggestions: Error calling Genkit flow:',
      error
    );
    return NextResponse.json(
      {
        message: error.message || 'Failed to generate course suggestions via Gemini.',
        errorDetails: error, // Keep full error for server logs, might prune for client
      },
      { status: 500 }
    );
  }
}
