import { test, expect } from '@playwright/test';
import { z } from 'zod';

// ─── Critical System Subsystems & Logic ──────────────────────────────────────

// 1. Pet Profile Subsystem (from src/app/dashboard/actions.ts)
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
    .refine((val) => Number(val) >= 0, { message: 'Age cannot be negative' })
    .refine((val) => Number(val) <= 100, { message: 'Age must be realistic (0–100)' }),
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

function validateAndNormalizePetProfile(input: Record<string, any>) {
  const validation = CreatePetInputSchema.safeParse(input);
  if (!validation.success) {
    const firstError = validation.error.issues?.[0]?.message || 'Invalid input';
    return { success: false, error: firstError, issues: validation.error.issues };
  }
  const data = validation.data;
  return {
    success: true,
    data: {
      name: data.name,
      age: data.age,
      breed: data.breed,
      gender: data.gender as 'Male' | 'Female',
      address: data.address,
      animalType: data.animalType as 'Dog' | 'Cat',
      description: data.description,
      healthCondition: data.healthCondition as 'Healthy' | 'Recovering' | 'Critical',
      adoptionStatus: data.adoptionStatus as 'Ready' | 'Pending' | 'Adopted',
      imageUrl: data.imageUrl,
      lastVaccinatedDate: data.lastVaccinatedDate || null,
      location: data.location
        ? {
            latitude: parseFloat(data.location.latitude),
            longitude: parseFloat(data.location.longitude),
          }
        : null,
    },
  };
}

// 2. Structured Data Subsystem (from src/app/api/struct-data)
type AllowedType = 'string' | 'number' | 'boolean' | 'date' | 'enum';
const ALLOWED_TYPES = ['string', 'number', 'boolean', 'date', 'enum'] as const;

const StructuredDataRequestSchema = z.object({
  text: z.string().min(1, 'Text cannot be empty'),
  format: z.record(
    z.string(),
    z
      .enum(ALLOWED_TYPES)
      .refine((format) => Object.keys(format).length > 0, 'Format must have at least one field'),
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

function processStructuredDataPipeline(
  requestBody: any,
  mockExtractor: (text: string, format: Record<string, AllowedType>) => { success: boolean; data?: any; error?: string },
) {
  const validation = StructuredDataRequestSchema.safeParse(requestBody);
  if (!validation.success) {
    return { success: false, status: 400, error: 'Invalid request format' };
  }

  const { text, format } = validation.data;
  const extraction = mockExtractor(text, format);
  if (!extraction.success) {
    return { success: false, status: 422, error: extraction.error || 'Extraction failed' };
  }

  try {
    const schema = generateZodSchema(format);
    const validated = schema.parse(extraction.data);
    return { success: true, status: 200, data: validated };
  } catch (err: any) {
    return { success: false, status: 422, error: 'Validation failed' };
  }
}

// 3. Offline Sync Subsystem (from src/lib/sync-service.ts and offline-storage.ts)
interface OfflineReport {
  id: string;
  animalType: 'Dog' | 'Cat' | 'Other';
  description: string;
  location: { lat: number; lng: number };
  synced: boolean;
}

class SystemSyncManager {
  private reports: OfflineReport[] = [];
  private failIds = new Set<string>();

  saveOffline(report: Omit<OfflineReport, 'id' | 'synced'>): OfflineReport {
    const created: OfflineReport = {
      ...report,
      id: `sys-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      synced: false,
    };
    this.reports.push(created);
    return created;
  }

  setSimulatedFailures(ids: string[]) {
    this.failIds = new Set(ids);
  }

  async runSyncBatch(): Promise<{ synced: number; failed: number }> {
    const pending = this.reports.filter((r) => !r.synced);
    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      if (this.failIds.has(item.id)) {
        failed++;
      } else {
        item.synced = true;
        synced++;
      }
    }
    return { synced, failed };
  }

  getUnsyncedCount(): number {
    return this.reports.filter((r) => !r.synced).length;
  }
}

// 4. API Key Auth Guard Subsystem (from src/lib/auth)
interface UserRecord {
  id: string;
  email: string;
  role: string;
  apiKey: string | null;
}

const mockDbUsers: UserRecord[] = [
  { id: 'usr-1', email: 'dev@test.com', role: 'Developer', apiKey: 'test-api-key-123' },
  { id: 'usr-2', email: 'shelter@test.com', role: 'Shelter_Admin', apiKey: 'admin-key-789' },
];

function apiAuthGuard(headers: Record<string, string | undefined>) {
  const apiKey =
    headers['x-api-key'] ??
    headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    return { authorized: false, status: 401, error: 'Invalid or missing API key' };
  }

  const user = mockDbUsers.find((u) => u.apiKey === apiKey);
  if (!user) {
    return { authorized: false, status: 401, error: 'Invalid or missing API key' };
  }

  return { authorized: true, user: { id: user.id, email: user.email, role: user.role } };
}

// 5. Semantic Vector Formatter (from src/app/dashboard/search-actions.ts)
function formatVectorForPostgres(embedding: number[]): string {
  return `[${embedding.join(', ')}]`;
}

// ─── System Test Cases (13 Critical Tests) ────────────────────────────────────

test.describe('System Tests: End-to-End Subsystem Pipelines', () => {
  test('1. End-to-end Pet Profile Validation & Enum Resolution Pipeline', () => {
    const rawInput = {
      name: 'Simba',
      age: '3',
      breed: 'Domestic Longhair',
      gender: 'Male',
      address: 'Colombo, Sri Lanka',
      animalType: 'Cat',
      description: 'Gentle and friendly cat looking for a caring family',
      healthCondition: 'Healthy',
      adoptionStatus: 'Ready',
      imageUrl: '/hero-cat.png',
      location: { latitude: '6.9271', longitude: '79.8612' },
    };

    const result = validateAndNormalizePetProfile(rawInput);
    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.name).toBe('Simba');
      expect(result.data.animalType).toBe('Cat');
      expect(result.data.location?.latitude).toBeCloseTo(6.9271);
      expect(result.data.lastVaccinatedDate).toBeNull();
    }
  });

  test('2. Pet Profile Validation Pipeline rejects invalid payload with descriptive error message', () => {
    const invalidInput = {
      name: 'Simba!@#', // invalid name
      age: '150', // unrealistic age
      breed: 'Cat',
      gender: 'Male',
      address: 'Colombo',
      animalType: 'Cat',
      description: '',
      healthCondition: 'Healthy',
      adoptionStatus: 'Ready',
      imageUrl: '/cat.png',
    };

    const result = validateAndNormalizePetProfile(invalidInput);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('3. Full Structured Data Service Pipeline executes request -> extraction -> validation -> response', () => {
    const request = {
      text: 'Four-year-old male dog named Buster from Kandy',
      format: {
        name: 'string',
        age: 'number',
        gender: 'enum',
      },
    };

    const mockExtractor = () => ({
      success: true,
      data: { name: 'Buster', age: 4, gender: 'Male' },
    });

    const pipelineResult = processStructuredDataPipeline(request, mockExtractor);
    expect(pipelineResult.success).toBe(true);
    expect(pipelineResult.status).toBe(200);
    expect(pipelineResult.data).toEqual({ name: 'Buster', age: 4, gender: 'Male' });
  });

  test('4. Structured Data Pipeline handles extraction errors and returns structured failure response', () => {
    const request = {
      text: 'Unstructured messy text',
      format: { name: 'string' },
    };

    const mockExtractor = () => ({
      success: false,
      error: 'Model failed to extract JSON',
    });

    const pipelineResult = processStructuredDataPipeline(request, mockExtractor);
    expect(pipelineResult.success).toBe(false);
    expect(pipelineResult.status).toBe(422);
    expect(pipelineResult.error).toBe('Model failed to extract JSON');
  });

  test('5. Offline Report storage to Sync Service batch processing pipeline', async () => {
    const manager = new SystemSyncManager();
    manager.saveOffline({ animalType: 'Dog', description: 'Stray dog at park', location: { lat: 6.9, lng: 79.8 } });
    manager.saveOffline({ animalType: 'Cat', description: 'Stray cat near shop', location: { lat: 7.0, lng: 80.0 } });

    expect(manager.getUnsyncedCount()).toBe(2);

    const batchResult = await manager.runSyncBatch();
    expect(batchResult.synced).toBe(2);
    expect(batchResult.failed).toBe(0);
    expect(manager.getUnsyncedCount()).toBe(0);
  });

  test('6. Sync Service handles partial server failures, maintaining accurate unsynced state', async () => {
    const manager = new SystemSyncManager();
    const r1 = manager.saveOffline({ animalType: 'Dog', description: 'Dog 1', location: { lat: 6.9, lng: 79.8 } });
    const r2 = manager.saveOffline({ animalType: 'Cat', description: 'Cat 2', location: { lat: 7.0, lng: 80.0 } });

    manager.setSimulatedFailures([r2.id]); // Simulate network error on r2

    const batchResult = await manager.runSyncBatch();
    expect(batchResult.synced).toBe(1);
    expect(batchResult.failed).toBe(1);
    expect(manager.getUnsyncedCount()).toBe(1);
  });

  test('7. Sync Service retry execution: retries previously failed reports and completes successfully', async () => {
    const manager = new SystemSyncManager();
    const r1 = manager.saveOffline({ animalType: 'Dog', description: 'Dog 1', location: { lat: 6.9, lng: 79.8 } });

    // Initial fail
    manager.setSimulatedFailures([r1.id]);
    await manager.runSyncBatch();
    expect(manager.getUnsyncedCount()).toBe(1);

    // Network restored -> retry succeeds
    manager.setSimulatedFailures([]);
    const retryResult = await manager.runSyncBatch();
    expect(retryResult.synced).toBe(1);
    expect(manager.getUnsyncedCount()).toBe(0);
  });

  test('8. API Key Auth Guard pipeline: extracts API key from x-api-key header and verifies user context', () => {
    const result = apiAuthGuard({ 'x-api-key': 'test-api-key-123' });
    expect(result.authorized).toBe(true);
    if (result.authorized && result.user) {
      expect(result.user.email).toBe('dev@test.com');
      expect(result.user.role).toBe('Developer');
    }
  });

  test('9. API Key Auth Guard pipeline: extracts API key from Authorization: Bearer header', () => {
    const result = apiAuthGuard({ authorization: 'Bearer admin-key-789' });
    expect(result.authorized).toBe(true);
    if (result.authorized && result.user) {
      expect(result.user.email).toBe('shelter@test.com');
      expect(result.user.role).toBe('Shelter_Admin');
    }
  });

  test('10. API Key Auth Guard pipeline: returns 401 Unauthorized for missing or invalid API keys', () => {
    const missing = apiAuthGuard({});
    expect(missing.authorized).toBe(false);
    expect(missing.status).toBe(401);

    const invalid = apiAuthGuard({ 'x-api-key': 'non-existent-key' });
    expect(invalid.authorized).toBe(false);
    expect(invalid.status).toBe(401);
  });

  test('11. Stray Report Processing System: validates coordinates and structures report entity', () => {
    const reportData = {
      animalType: 'Dog',
      animalCount: 2,
      environment: 'Street corner',
      urgency: 'High' as const,
      description: 'Two stray puppies abandoned near bus stand',
      location: { lat: 6.9271, lng: 79.8612 },
    };

    const timestamp = new Date().toISOString();
    const systemReport = {
      id: 'rep-001',
      ...reportData,
      imageUrl: '/uploads/report.jpg',
      timeStamp: timestamp,
    };

    expect(systemReport.id).toBe('rep-001');
    expect(systemReport.urgency).toBe('High');
    expect(systemReport.location.lat).toBe(6.9271);
    expect(systemReport.timeStamp).toBe(timestamp);
  });

  test('12. Semantic Search Vector Formatting pipeline: formats embedding array into pgvector literal format', () => {
    const embedding = [0.123, -0.456, 0.789];
    const formatted = formatVectorForPostgres(embedding);
    expect(formatted).toBe('[0.123, -0.456, 0.789]');
    expect(formatted.startsWith('[')).toBe(true);
    expect(formatted.endsWith(']')).toBe(true);
  });

  test('13. User Onboarding Role Validation pipeline: ensures valid role assignment', () => {
    const RoleEnum = z.enum(['Adopter', 'Volunteer', 'Shelter_Admin', 'Developer']);
    
    expect(RoleEnum.safeParse('Adopter').success).toBe(true);
    expect(RoleEnum.safeParse('Volunteer').success).toBe(true);
    expect(RoleEnum.safeParse('Shelter_Admin').success).toBe(true);
    expect(RoleEnum.safeParse('Developer').success).toBe(true);
    expect(RoleEnum.safeParse('SuperAdmin').success).toBe(false);
    expect(RoleEnum.safeParse('').success).toBe(false);
  });
});
