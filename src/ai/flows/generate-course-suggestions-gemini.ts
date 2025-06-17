'use server';
/**
 * @fileOverview Genkit flow to generate course suggestions using Gemini.
 * - generateCourseSuggestionsGemini: Generates AI description and next course suggestions.
 * - GeminiCourseSuggestionInput: Input type.
 * - GeminiCourseSuggestionOutput: Output type (matches schema defined).
 */

import { ai } from '@/ai/genkit';
import { 
    GeminiCourseSuggestionInputSchema, 
    type GeminiCourseSuggestionInput,
    GeminiCourseSuggestionOutputSchema,
    type GeminiCourseSuggestionOutput 
} from '@/ai/schemas/course-suggestion-schemas';


export async function generateCourseSuggestionsGemini(input: GeminiCourseSuggestionInput): Promise<GeminiCourseSuggestionOutput> {
  return generateCourseSuggestionsGeminiFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCourseSuggestionsGeminiPrompt',
  input: { schema: GeminiCourseSuggestionInputSchema },
  output: { schema: GeminiCourseSuggestionOutputSchema },
  prompt: `You are an expert curriculum advisor.
For the course named "{{courseName}}", provide the following:
1.  A concise 1-2 sentence AI-generated description for "{{courseName}}". If you cannot generate one, the aiDescription field should be null.
2.  Suggest 2-3 relevant next courses that build upon "{{courseName}}". For each suggested course, provide its name, a brief 1-2 sentence description, and a valid URL to learn more or take the course.
    If no relevant next courses can be suggested, the suggestedNextCourses array should be empty.

Ensure your output strictly adheres to the requested JSON schema structure.
The "suggestedNextCourses" should be an array of objects, each object having "name", "description", and "url" fields.
`,
});

const generateCourseSuggestionsGeminiFlow = ai.defineFlow(
  {
    name: 'generateCourseSuggestionsGeminiFlow',
    inputSchema: GeminiCourseSuggestionInputSchema,
    outputSchema: GeminiCourseSuggestionOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
        // This case should ideally be handled by Genkit if the model fails to produce schema-compliant output.
        // However, as a fallback, we return a structure indicating failure to the caller.
        console.error(`Gemini flow for ${input.courseName} did not return an output or failed schema validation.`);
        return {
            aiDescription: "Error: Gemini failed to generate a description for this course.",
            suggestedNextCourses: []
        };
    }
    return output;
  }
);
