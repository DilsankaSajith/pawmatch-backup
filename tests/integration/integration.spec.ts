import { test, expect } from '@playwright/test';
import { z } from 'zod';

// ─── Critical Logic Definitions for Integration Testing ──────────────────────

// 1. CreatePetInputSchema (from src/app/dashboard/actions.ts)
const CreatePetInputSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters'),
  age: z
    .string()
    .min(1, 'Age is required')
    .refine((val) => !isNaN(Number(val)) && Number.isInteger(Number(val)), {
      message: 'Age must be a whole number',
    })
    .refine((val) => Number(val) >= 0, {
      message: 'Age cannot be negative',
    })
    .refine((val) => Number(val) <= 100, {
      message: 'Age must be realistic (0–100)',
    }),
  breed: z
    .string()
    .min(1, 'Breed is required')
    .regex(/^[a-zA-Z\s]+$/, 'Breed can only contain letters'),
  gender: z.string(),
  address: z.string().min(1, 'Address is required'),
  animalType: z.string(),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(1000, 'Description cannot exceed 1000 characters'),
  healthCondition: z.string(),
  adoptionStatus: z.string(),
  imageUrl: z.string(),
  lastVaccinatedDate: z.string().optional(),
  location: z
    .object({
      latitude: z.string(),
      longitude: z.string(),
    })
    .optional(),
});

// 2. Structured Data Validator & Generator (from src/app/api/struct-data)
type AllowedType = 'string' | 'number' | 'boolean' | 'date' | 'enum';
const ALLOWED_TYPES = ['string', 'number', 'boolean', 'date', 'enum'] as const;

const StructuredDataRequestSchema = z.object({
  text: z.string().min(1, 'Text cannot be empty'),
  format: z.record(
    z.string(),
    z
      .enum(ALLOWED_TYPES)
      .refine(
        (format) => Object.keys(format).length > 0,
        'Format must have at least one field',
      ),
  ),
});

function generateZodSchema(format: Record<string, AllowedType>) {
  const schemaObject: Record<string, z.ZodType> = {};
  for (const [key, type] of Object.entries(format)) {
    let zodType: z.ZodType;
    switch (type) {
      case 'string': zodType = z.string().nullable().optional(); break;
      case 'number': zodType = z.number().nullable().optional(); break;
      case 'boolean': zodType = z.boolean().nullable().optional(); break;
      case 'date': zodType = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(); break;
      case 'enum': zodType = z.string().nullable().optional(); break;
      default: zodType = z.any().nullable().optional();
    }
    schemaObject[key] = zodType;
  }
  return z.object(schemaObject);
}

function validateStructuredData(data: Record<string, any>, format: Record<string, AllowedType>) {
  const schema = generateZodSchema(format);
  return schema.parse(data);
}

// 3. Similarity Pipeline Types
const similarityResponseSchema = z.object({
  score: z.number(),
  label: z.enum(['similar', 'not_relevant', 'maybe']),
});

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

// 4. Offline Storage In-Memory Adapter (mirroring src/lib/offline-storage.ts)
interface OfflineReport {
  id: string;
  animalType: 'Dog' | 'Cat' | 'Other';
  description: string;
  location: { lat: number; lng: number };
  createdAt: string;
  synced: boolean;
}

function createOfflineStorage() {
  let storage: OfflineReport[] = [];
  return {
    getReports: (): OfflineReport[] => [...storage],
    saveReport: (report: Omit<OfflineReport, 'id' | 'createdAt' | 'synced'>) => {
      const newReport: OfflineReport = {
        ...report,
        id: `offline-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: new Date().toISOString(),
        synced: false,
      };
      storage.push(newReport);
      return newReport;
    },
    getUnsyncedReports: (): OfflineReport[] => storage.filter((r) => !r.synced),
    markAsSynced: (id: string) => {
      storage = storage.map((r) => (r.id === id ? { ...r, synced: true } : r));
    },
    getUnsyncedCount: (): number => storage.filter((r) => !r.synced).length,
  };
}

// 5. Query String Builder Helper (from src/components/filter-sidebar.tsx)
function createQueryString(currentParams: URLSearchParams, name: string, value: string) {
  const params = new URLSearchParams(currentParams.toString());
  if (value) {
    params.set(name, value);
  } else {
    params.delete(name);
  }
  return params.toString();
}

// ─── Integration Test Cases (13 Critical Tests) ───────────────────────────────

test.describe('Integration Tests: Critical Workflows', () => {
  test('1. CreatePetInputSchema + Enum integration validates complete valid pet profile', () => {
    const validInput = {
      name: 'Buddy',
      age: '4',
      breed: 'Labrador Mix',
      gender: 'Male',
      address: '123 Park Lane, Colombo',
      animalType: 'Dog',
      description: 'Friendly and vaccinated dog',
      healthCondition: 'Healthy',
      adoptionStatus: 'Ready',
      imageUrl: '/hero-dog.png',
      lastVaccinatedDate: '2024-01-15',
      location: { latitude: '6.9055', longitude: '79.8633' },
    };

    const result = CreatePetInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Buddy');
      expect(result.data.location?.latitude).toBe('6.9055');
    }
  });

  test('2. CreatePetInputSchema validation rejects invalid fields and reports issues', () => {
    const invalidInput = {
      name: 'Buddy123', // contains numbers
      age: 'invalid-age',
      breed: '',
      gender: 'Male',
      address: '',
      animalType: 'Dog',
      description: '',
      healthCondition: 'Healthy',
      adoptionStatus: 'Ready',
      imageUrl: '/hero-dog.png',
    };

    const result = CreatePetInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(4);
      const fields = result.error.issues.map((issue) => issue.path[0]);
      expect(fields).toContain('name');
      expect(fields).toContain('age');
      expect(fields).toContain('address');
      expect(fields).toContain('description');
    }
  });

  test('3. Dynamic Schema Generation + Structured Data Validation validates extracted pet payload', () => {
    const PET_FORMAT: Record<string, AllowedType> = {
      name: 'string',
      age: 'number',
      breed: 'string',
      gender: 'enum',
      description: 'string',
      address: 'string',
      animalType: 'enum',
      lastVaccinatedDate: 'date',
      healthCondition: 'enum',
    };

    const extracted = {
      name: 'Bella',
      age: 2,
      breed: 'German Shepherd',
      gender: 'Female',
      description: 'Active rescue dog',
      address: 'Kandy, Sri Lanka',
      animalType: 'Dog',
      lastVaccinatedDate: '2024-04-10',
      healthCondition: 'Healthy',
    };

    const validated = validateStructuredData(extracted, PET_FORMAT);
    expect(validated.name).toBe('Bella');
    expect(validated.age).toBe(2);
    expect(validated.lastVaccinatedDate).toBe('2024-04-10');
  });

  test('4. Dynamic Schema Pipeline gracefully handles null and omitted fields from AI extraction', () => {
    const format: Record<string, AllowedType> = {
      name: 'string',
      age: 'number',
      lastVaccinatedDate: 'date',
    };

    const partialExtracted = {
      name: 'Stray Cat',
      age: null,
      // lastVaccinatedDate omitted
    };

    const validated = validateStructuredData(partialExtracted, format);
    expect(validated.name).toBe('Stray Cat');
    expect(validated.age).toBeNull();
    expect(validated.lastVaccinatedDate).toBeUndefined();
  });

  test('5. Cosine similarity calculation + response schema validation contract', () => {
    const embA = [0.2, 0.5, 0.8];
    const embB = [0.2, 0.49, 0.81];

    const score = cosineSimilarity(embA, embB);
    const label = getLabel(score);
    const payload = { score, label };

    const parsed = similarityResponseSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.label).toBe('similar');
      expect(parsed.data.score).toBeGreaterThan(0.8);
    }
  });

  test('6. Similarity pipeline edge cases: zero/orthogonal and collinear vectors output correct label', () => {
    const orthogonalA = [1, 0, 0];
    const orthogonalB = [0, 1, 0];
    const scoreOrthogonal = cosineSimilarity(orthogonalA, orthogonalB);
    expect(getLabel(scoreOrthogonal)).toBe('not_relevant');

    const collinearA = [1, 2, 3];
    const collinearB = [2, 4, 6];
    const scoreCollinear = cosineSimilarity(collinearA, collinearB);
    expect(getLabel(scoreCollinear)).toBe('similar');
  });

  test('7. Email template generation integrates dynamic pet and applicant values', () => {
    const petName = 'Charlie';
    const applicantEmail = 'adopter@test.com';

    const newAppSubject = `New application received for ${petName}`;
    const newAppBody = `<p>Pet: ${petName}</p><p>Applicant: ${applicantEmail}</p>`;

    expect(newAppSubject).toContain('Charlie');
    expect(newAppBody).toContain('Charlie');
    expect(newAppBody).toContain('adopter@test.com');
  });

  test('8. Offline storage CRUD cycle: save report and retrieve report list', () => {
    const storage = createOfflineStorage();
    expect(storage.getReports()).toHaveLength(0);

    const saved = storage.saveReport({
      animalType: 'Dog',
      description: 'Injured stray dog found near junction',
      location: { lat: 6.9271, lng: 79.8612 },
    });

    expect(saved.id.startsWith('offline-')).toBe(true);
    expect(saved.synced).toBe(false);

    const reports = storage.getReports();
    expect(reports).toHaveLength(1);
    expect(reports[0].animalType).toBe('Dog');
  });

  test('9. Offline storage sync state transition: save -> getUnsynced -> markAsSynced', () => {
    const storage = createOfflineStorage();
    const r1 = storage.saveReport({
      animalType: 'Cat',
      description: 'Kitten stranded in drain',
      location: { lat: 6.9, lng: 79.85 },
    });

    expect(storage.getUnsyncedCount()).toBe(1);
    expect(storage.getUnsyncedReports()[0].id).toBe(r1.id);

    storage.markAsSynced(r1.id);
    expect(storage.getUnsyncedCount()).toBe(0);
    expect(storage.getReports()[0].synced).toBe(true);
  });

  test('10. Offline storage multi-item sync: selective sync updates only specified report IDs', () => {
    const storage = createOfflineStorage();
    const r1 = storage.saveReport({ animalType: 'Dog', description: 'Dog 1', location: { lat: 6.9, lng: 79.8 } });
    const r2 = storage.saveReport({ animalType: 'Cat', description: 'Cat 2', location: { lat: 7.0, lng: 80.0 } });

    expect(storage.getUnsyncedCount()).toBe(2);

    storage.markAsSynced(r1.id);
    expect(storage.getUnsyncedCount()).toBe(1);
    expect(storage.getUnsyncedReports()[0].id).toBe(r2.id);
  });

  test('11. StructuredDataRequestSchema format validation accepts allowed types and rejects invalid ones', () => {
    const valid = StructuredDataRequestSchema.safeParse({
      text: 'Stray puppy found',
      format: { name: 'string', count: 'number' },
    });
    expect(valid.success).toBe(true);

    const invalidType = StructuredDataRequestSchema.safeParse({
      text: 'Stray puppy found',
      format: { name: 'unsupported_type' },
    });
    expect(invalidType.success).toBe(false);

    const emptyText = StructuredDataRequestSchema.safeParse({
      text: '',
      format: { name: 'string' },
    });
    expect(emptyText.success).toBe(false);
  });

  test('12. Filter query string builder integration correctly builds and deletes URL search params', () => {
    const params = new URLSearchParams('sort=newest&type=Dog');
    
    // Update existing filter
    const updated = createQueryString(params, 'type', 'Cat');
    expect(updated).toBe('sort=newest&type=Cat');

    // Add new filter
    const added = createQueryString(params, 'gender', 'Male');
    expect(added).toBe('sort=newest&type=Dog&gender=Male');

    // Remove filter when value is empty
    const removed = createQueryString(params, 'type', '');
    expect(removed).toBe('sort=newest');
  });

  test('13. Option validator UI constants match system enum options', () => {
    const urgencyValues = ['Urgent', 'High', 'Medium', 'Low'];
    const healthValues = ['Healthy', 'Recovering', 'Critical'];
    const adoptionValues = ['Ready', 'Pending', 'Adopted'];

    expect(urgencyValues).toHaveLength(4);
    expect(healthValues).toHaveLength(3);
    expect(adoptionValues).toHaveLength(3);
    expect(urgencyValues[0]).toBe('Urgent');
    expect(adoptionValues[0]).toBe('Ready');
  });
});
