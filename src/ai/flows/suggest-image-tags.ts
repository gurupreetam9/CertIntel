'use server';

/**
 * @fileOverview AI agent that suggests relevant tags for an image.
 *
 * - suggestImageTags - A function that suggests relevant tags for an image.
 * - SuggestImageTagsInput - The input type for the suggestImageTags function.
 * - SuggestImageTagsOutput - The return type for the suggestImageTags function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestImageTagsInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of an image, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type SuggestImageTagsInput = z.infer<typeof SuggestImageTagsInputSchema>;

const SuggestImageTagsOutputSchema = z.object({
  tags: z.array(z.string()).describe('An array of relevant tags for the image.'),
});
export type SuggestImageTagsOutput = z.infer<typeof SuggestImageTagsOutputSchema>;

export async function suggestImageTags(input: SuggestImageTagsInput): Promise<SuggestImageTagsOutput> {
  return suggestImageTagsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestImageTagsPrompt',
  input: {schema: SuggestImageTagsInputSchema},
  output: {schema: SuggestImageTagsOutputSchema},
  prompt: `You are an expert image tagger. You will generate tags that are relevant to the image provided.

  You will return an array of tags that can be used to organize and search for the image.

  Image: {{media url=photoDataUri}}`,
});

const suggestImageTagsFlow = ai.defineFlow(
  {
    name: 'suggestImageTagsFlow',
    inputSchema: SuggestImageTagsInputSchema,
    outputSchema: SuggestImageTagsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
