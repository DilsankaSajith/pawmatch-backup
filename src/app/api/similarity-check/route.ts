import { withApiKeyAuth } from '@/lib/auth/with-api-key';
import { EmbeddingService } from '@/lib/embedding-service';
import { NextRequest, NextResponse } from 'next/server';
import z from 'zod';

const similarityRequestSchema = z.object({
  text1: z.string().min(1, 'First text cannot be empty'),
  text2: z.string().min(1, 'Second text cannot be empty'),
});

const similarityResponseSchema = z.object({
  score: z.number(),
  label: z.enum(['similar', 'not_relevant', 'maybe']),
});

// cosine similarity function
const cosineSimilarity = (
  firstEmbArray: number[],
  secondEmbArray: number[],
) => {
  const dot = firstEmbArray.reduce(
    (sum, val, i) => sum + val * secondEmbArray[i],
    0,
  );
  const normA = Math.sqrt(
    firstEmbArray.reduce((sum, val) => sum + val * val, 0),
  );
  const normB = Math.sqrt(
    secondEmbArray.reduce((sum, val) => sum + val * val, 0),
  );
  return dot / (normA * normB);
};

// get relevant label to the score
const getLabel = (score: number): 'similar' | 'not_relevant' | 'maybe' => {
  if (score > 0.8) return 'similar';
  if (score < 0.3) return 'not_relevant';
  return 'maybe';
};

export const POST = withApiKeyAuth(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { text1, text2 } = similarityRequestSchema.parse(body);

    const embeddingService = EmbeddingService.getInstance();
    const [emb1, emb2] = await embeddingService.generateEmbeddings([
      text1,
      text2,
    ]);

    const score = cosineSimilarity(emb1, emb2);
    const label = getLabel(score);

    const response = { score, label };

    similarityResponseSchema.parse(response);

    return NextResponse.json(response, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'Internal server error. Please try again later' },
      { status: 400 },
    );
  }
});
