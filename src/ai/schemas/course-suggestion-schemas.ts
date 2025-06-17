'use server';

import { z } from 'zod';

export const LLMSuggestionSchema = z.object({
  name: z.string().describe("The name of the suggested next course."),
  description: z.string().describe("A brief 1-2 sentence description for this suggested course."),
  url: z.string().url().describe("A valid, direct URL to learn more or take the suggested course.")
});
export type LLMSuggestion = z.infer<typeof LLMSuggestionSchema>;

export const GeminiCourseSuggestionOutputSchema = z.object({
  aiDescription: z.string().nullable().describe("A concise 1-2 sentence description for the identified course. If none can be generated, this should be null."),
  suggestedNextCourses: z.array(LLMSuggestionSchema)
    .describe("An array of 2-3 relevant next courses. If no relevant courses, this array should be empty.")
});
export type GeminiCourseSuggestionOutput = z.infer<typeof GeminiCourseSuggestionOutputSchema>;

export const GeminiCourseSuggestionInputSchema = z.object({
    courseName: z.string().describe("The name of the course for which suggestions are needed.")
});
export type GeminiCourseSuggestionInput = z.infer<typeof GeminiCourseSuggestionInputSchema>;
