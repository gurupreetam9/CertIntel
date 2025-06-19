
'use server';
/**
 * @fileOverview AI agent that predicts likely next words for a given text input.
 *
 * - predictNextWords - A function that suggests next words.
 * - PredictNextWordsInput - The input type.
 * - PredictNextWordsOutput - The return type.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const PredictNextWordsInputSchema = z.object({
  currentText: z.string().describe('The current text input by the user.'),
});
export type PredictNextWordsInput = z.infer<typeof PredictNextWordsInputSchema>;

const PredictNextWordsOutputSchema = z.object({
  predictions: z.array(z.string()).describe('An array of likely next words or short phrases.'),
});
export type PredictNextWordsOutput = z.infer<typeof PredictNextWordsOutputSchema>;

export async function predictNextWords(input: PredictNextWordsInput): Promise<PredictNextWordsOutput> {
  return predictNextWordsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'predictNextWordsPrompt',
  input: {schema: PredictNextWordsInputSchema},
  output: {schema: PredictNextWordsOutputSchema},
  prompt: `Given the following text, predict a few likely next words or short phrases that would logically follow.
Provide up to 3-4 concise predictions. Each prediction should be a single word or a short phrase of 2-3 words at most.
Return the predictions as a list of strings. Do not return the input text as part of the predictions. If the input text is a complete thought or phrase, return an empty list.

Current text: "{{currentText}}"`,
});

const predictNextWordsFlow = ai.defineFlow(
  {
    name: 'predictNextWordsFlow',
    inputSchema: PredictNextWordsInputSchema,
    outputSchema: PredictNextWordsOutputSchema,
  },
  async (input: PredictNextWordsInput) => {
    if (!input.currentText.trim()) {
      return { predictions: [] };
    }
    // Add a space if not ending with one, to encourage predicting the *next* word
    const promptInputText = input.currentText.endsWith(' ') ? input.currentText : `${input.currentText} `;

    const {output} = await prompt({currentText: promptInputText});
    return output || {predictions: []};
  }
);
