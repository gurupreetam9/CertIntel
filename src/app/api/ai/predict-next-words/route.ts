
import {NextRequest, NextResponse} from 'next/server';
import {
  predictNextWords,
  type PredictNextWordsInput,
  type PredictNextWordsOutput,
} from '@/ai/flows/predict-next-words';
import {z} from 'zod';

const RequestBodySchema = z.object({
  currentText: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsedBody = RequestBodySchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        {message: 'Invalid request body', errors: parsedBody.error.format()},
        {status: 400}
      );
    }

    const input: PredictNextWordsInput = parsedBody.data;

    if (!input.currentText.trim()) {
      return NextResponse.json({predictions: []});
    }

    const result: PredictNextWordsOutput = await predictNextWords(input);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('API /api/ai/predict-next-words: Error calling Genkit flow:', error);
    return NextResponse.json(
      {message: error.message || 'Failed to predict next words.', error: error},
      {status: 500}
    );
  }
}
