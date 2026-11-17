import { test, expect } from '@playwright/test';
import { z } from 'zod';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ─── Critical Logic Definitions for Unit Testing ─────────────────────────────

// 1. Pet Validators (from src/lib/validators/pet-validator.ts)
const PET_NAME_VALIDATOR = z
  .string()
  .min(1, 'Name is required')
  .regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters');

const PET_AGE_VALIDATOR = z
  .number()
  .int('Age must be a whole number')
  .min(0, 'Age cannot be negative')
  .max(100, 'Age must be realistic');

const PET_BREED_VALIDATOR = z
  .string()
  .min(1, 'Breed is required')
  .regex(/^[a-zA-Z\s]+$/, 'Breed can only contain letters');

const PET_DESCRIPTION_VALIDATOR = z
  .string()
  .min(1, 'Description is required')
  .max(1000, 'Description cannot exceed 1000 characters');

const PET_LAST_VACCINATED_DATE_VALIDATOR = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .optional();

// 2. Similarity & Label Logic (from src/app/api/similarity-check/route.ts)
const cosineSimilarity = (firstEmbArray: number[], secondEmbArray: number[]) => {
  const dot = firstEmbArray.reduce((sum, val, i) => sum + val * secondEmbArray[i], 0);
  const normA = Math.sqrt(firstEmbArray.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(secondEmbArray.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
};

const getLabel = (score: number): 'similar' | 'not_relevant' | 'maybe' => {
  if (score > 0.8) return 'similar';
  if (score < 0.3) return 'not_relevant';
  return 'maybe';
};

// 3. Dynamic Zod Schema Generator (from src/app/api/struct-data/services.ts)
type AllowedType = 'string' | 'number' | 'boolean' | 'date' | 'enum';

function generateZodSchema(format: Record<string, AllowedType>) {
  const schemaObject: Record<string, z.ZodType> = {};
  for (const [key, type] of Object.entries(format)) {
    let zodType: z.ZodType;
    switch (type) {
      case 'string':
        zodType = z.string().nullable().optional();
        break;
      case 'number':
        zodType = z.number().nullable().optional();
        break;
      case 'boolean':
        zodType = z.boolean().nullable().optional();
        break;
      case 'date':
        zodType = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
        break;
      case 'enum':
        zodType = z.string().nullable().optional();
        break;
      default:
        zodType = z.any().nullable().optional();
    }
    schemaObject[key] = zodType;
  }
  return z.object(schemaObject);
}

// 4. DateTime Helper (from src/lib/helpers.ts)
const getFormattedDateTime = () => {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(now);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now);
  return `📅 ${date} ${time}`;
};

// 5. Tailwind Merge cn Utility (from src/lib/utils.ts)
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 6. Email Templates (from src/lib/email-templates.ts)
function applicationAcceptedEmail(petName: string) {
  return {
    subject: `Great news! Your application for ${petName} was accepted 🎉`,
    html: `<h1>Wonderful News!</h1><p>Your application to adopt <strong>${petName}</strong> has been Accepted ✓</p>`,
  };
}

function applicationRejectedEmail(petName: string) {
  return {
    subject: `Update on your application for ${petName}`,
    html: `<h1>An Update for You</h1><p>Your application to adopt <strong>${petName}</strong> was not accepted this time.</p>`,
  };
}

// 7. PDF Splitter (from src/lib/pdf-processor.ts)
function splitPetEntries(text: string): string[] {
  const entries = text
    .split(/\n\s*\n|•|\d+\.\s*/)
    .filter((entry) => entry.trim().length > 50);
  return entries.length > 0 ? entries : [text];
}

// ─── Unit Test Cases (13 Critical Tests) ──────────────────────────────────────

test.describe('Unit Tests: Critical Logic', () => {
  test('1. PET_NAME_VALIDATOR validates valid letters and rejects digits/symbols', () => {
    expect(PET_NAME_VALIDATOR.safeParse('Buddy').success).toBe(true);
    expect(PET_NAME_VALIDATOR.safeParse('Luna Star').success).toBe(true);
    expect(PET_NAME_VALIDATOR.safeParse('').success).toBe(false);
    expect(PET_NAME_VALIDATOR.safeParse('Buddy123').success).toBe(false);
    expect(PET_NAME_VALIDATOR.safeParse('Max!').success).toBe(false);
  });

  test('2. PET_AGE_VALIDATOR enforces integer age within range 0-100', () => {
    expect(PET_AGE_VALIDATOR.safeParse(0).success).toBe(true);
    expect(PET_AGE_VALIDATOR.safeParse(5).success).toBe(true);
    expect(PET_AGE_VALIDATOR.safeParse(100).success).toBe(true);
    expect(PET_AGE_VALIDATOR.safeParse(-1).success).toBe(false);
    expect(PET_AGE_VALIDATOR.safeParse(101).success).toBe(false);
    expect(PET_AGE_VALIDATOR.safeParse(3.5).success).toBe(false);
  });

  test('3. PET_BREED_VALIDATOR enforces alphabetical breed name', () => {
    expect(PET_BREED_VALIDATOR.safeParse('Golden Retriever').success).toBe(true);
    expect(PET_BREED_VALIDATOR.safeParse('Domestic Shorthair').success).toBe(true);
    expect(PET_BREED_VALIDATOR.safeParse('').success).toBe(false);
    expect(PET_BREED_VALIDATOR.safeParse('Breed123').success).toBe(false);
  });

  test('4. PET_DESCRIPTION_VALIDATOR enforces length constraints between 1 and 1000 characters', () => {
    expect(PET_DESCRIPTION_VALIDATOR.safeParse('Friendly rescue dog.').success).toBe(true);
    expect(PET_DESCRIPTION_VALIDATOR.safeParse('').success).toBe(false);
    expect(PET_DESCRIPTION_VALIDATOR.safeParse('a'.repeat(1000)).success).toBe(true);
    expect(PET_DESCRIPTION_VALIDATOR.safeParse('a'.repeat(1001)).success).toBe(false);
  });

  test('5. PET_LAST_VACCINATED_DATE_VALIDATOR validates YYYY-MM-DD date format', () => {
    expect(PET_LAST_VACCINATED_DATE_VALIDATOR.safeParse('2024-03-15').success).toBe(true);
    expect(PET_LAST_VACCINATED_DATE_VALIDATOR.safeParse(undefined).success).toBe(true);
    expect(PET_LAST_VACCINATED_DATE_VALIDATOR.safeParse('15-03-2024').success).toBe(false);
    expect(PET_LAST_VACCINATED_DATE_VALIDATOR.safeParse('2024/03/15').success).toBe(false);
  });

  test('6. cosineSimilarity computes expected dot/norm ratio for vector comparisons', () => {
    const identical = cosineSimilarity([1, 2, 3], [1, 2, 3]);
    expect(identical).toBeCloseTo(1.0, 5);

    const opposite = cosineSimilarity([1, 0, 0], [-1, 0, 0]);
    expect(opposite).toBeCloseTo(-1.0, 5);

    const orthogonal = cosineSimilarity([1, 0], [0, 1]);
    expect(orthogonal).toBeCloseTo(0.0, 5);
  });

  test('7. getLabel categorizes similarity scores into similar, maybe, and not_relevant', () => {
    expect(getLabel(0.85)).toBe('similar');
    expect(getLabel(0.95)).toBe('similar');
    expect(getLabel(0.5)).toBe('maybe');
    expect(getLabel(0.8)).toBe('maybe');
    expect(getLabel(0.3)).toBe('maybe');
    expect(getLabel(0.2)).toBe('not_relevant');
    expect(getLabel(0.0)).toBe('not_relevant');
  });

  test('8. generateZodSchema maps types (string, number, boolean, date, enum) to schema definitions', () => {
    const schema = generateZodSchema({
      title: 'string',
      count: 'number',
      isReady: 'boolean',
      eventDate: 'date',
      category: 'enum',
    });

    const validData = {
      title: 'Rescue Operation',
      count: 4,
      isReady: true,
      eventDate: '2024-05-10',
      category: 'Emergency',
    };
    expect(schema.safeParse(validData).success).toBe(true);

    const invalidDate = { ...validData, eventDate: 'May 10 2024' };
    expect(schema.safeParse(invalidDate).success).toBe(false);
  });

  test('9. getFormattedDateTime produces formatted date string with calendar emoji', () => {
    const result = getFormattedDateTime();
    expect(result.startsWith('📅')).toBe(true);
    expect(result).toMatch(/📅 \w{3} \d{1,2}, \d{4} \d{1,2}:\d{2} (AM|PM)/);
  });

  test('10. cn merges class names and resolves tailwind utility conflicts', () => {
    expect(cn('p-2', 'text-center')).toBe('p-2 text-center');
    expect(cn('px-2', 'px-4')).toBe('px-4'); // tailwind-merge resolves conflict
    expect(cn('base', false && 'hidden', undefined, null)).toBe('base');
  });

  test('11. applicationAcceptedEmail generates celebration subject and structured email markup', () => {
    const email = applicationAcceptedEmail('Max');
    expect(email.subject).toBe('Great news! Your application for Max was accepted 🎉');
    expect(email.html).toContain('Max');
    expect(email.html).toContain('Accepted ✓');
  });

  test('12. applicationRejectedEmail generates empathetic update subject without celebration indicator', () => {
    const email = applicationRejectedEmail('Bella');
    expect(email.subject).toBe('Update on your application for Bella');
    expect(email.subject).not.toContain('🎉');
    expect(email.html).toContain('Bella');
    expect(email.html).toContain('not accepted this time');
  });

  test('13. splitPetEntries extracts individual pet descriptions separated by delimiters', () => {
    const entryA = 'A'.repeat(60);
    const entryB = 'B'.repeat(60);
    const text = `${entryA}\n\n${entryB}`;
    const result = splitPetEntries(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(entryA);
    expect(result[1]).toBe(entryB);

    const shortText = 'Too short';
    expect(splitPetEntries(shortText)).toEqual([shortText]);
  });
});
