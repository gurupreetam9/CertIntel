
import {NextRequest, NextResponse} from 'next/server';
import {
  generateImageDescription,
  type GenerateImageDescriptionInput,
  type GenerateImageDescriptionOutput,
} from '@/ai/flows/generate-image-description';
import {z} from 'zod';

// Define the expected request body schema
const RequestBodySchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
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

    const input: GenerateImageDescriptionInput = parsedBody.data;

    console.log(
      `API /api/ai/generate-description: Calling Genkit flow with photoDataUri (first 50 chars): ${input.photoDataUri.substring(0, 50)}...`
    );

    const result: GenerateImageDescriptionOutput =
      await generateImageDescription(input);

    if (result.description) {
      return NextResponse.json({description: result.description});
    } else {
      // Handle cases where the flow might return successfully but without a description,
      // or if the flow itself throws an error (though that should be caught below).
      return NextResponse.json(
        {message: 'AI did not return a description.'},
        {status: 500}
      );
    }
  } catch (error: any) {
    console.error(
      'API /api/ai/generate-description: Error calling Genkit flow:',
      error
    );
    return NextResponse.json(
      {
        message: error.message || 'Failed to generate image description.',
        error: error,
      },
      {status: 500}
    );
  }
}
