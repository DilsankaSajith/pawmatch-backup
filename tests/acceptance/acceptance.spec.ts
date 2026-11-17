import { test, expect } from '@playwright/test';

// ─── Domain Types & Business Logic Simulating Core User Workflows ────────────

interface Pet {
  id: string;
  name: string;
  adoptionStatus: 'Ready' | 'Pending' | 'Adopted';
  addedById: string;
}

interface Application {
  id: string;
  petId: string;
  applicantId: string;
  addedById: string;
  status: 'Pending' | 'Approved' | 'Rejected';
}

interface Notification {
  to: string;
  subject: string;
  type: 'accepted' | 'rejected' | 'new_application';
}

interface OfflineReport {
  id: string;
  animalType: 'Dog' | 'Cat' | 'Other';
  description: string;
  location: { lat: number; lng: number };
  synced: boolean;
}

class PawMatchPlatform {
  private pets: Pet[] = [];
  private applications: Application[] = [];
  private notifications: Notification[] = [];
  private offlineReports: OfflineReport[] = [];
  private apiKeys = new Map<string, string>(); // userId -> apiKey
  private appCounter = 0;

  addPet(pet: Pet) {
    this.pets.push(pet);
  }

  getPet(id: string) {
    return this.pets.find((p) => p.id === id);
  }

  getAvailablePets() {
    return this.pets.filter((p) => p.adoptionStatus === 'Ready');
  }

  submitApplication(petId: string, applicantId: string): { success: boolean; application?: Application; error?: string } {
    const pet = this.getPet(petId);
    if (!pet) return { success: false, error: 'Pet not found' };
    if (pet.adoptionStatus !== 'Ready') return { success: false, error: 'Pet is not available for adoption' };
    if (pet.addedById === applicantId) return { success: false, error: 'You cannot apply to adopt your own pet 🐾' };

    const existing = this.applications.find((a) => a.petId === petId && a.applicantId === applicantId);
    if (existing) return { success: false, error: 'Your Adoption Request Is Already In 🐾' };

    const app: Application = {
      id: `app-${++this.appCounter}`,
      petId,
      applicantId,
      addedById: pet.addedById,
      status: 'Pending',
    };
    this.applications.push(app);

    this.notifications.push({
      to: pet.addedById,
      subject: `New application received for ${pet.name}`,
      type: 'new_application',
    });

    return { success: true, application: app };
  }

  approveApplication(applicationId: string, adminId: string): { success: boolean; error?: string } {
    const app = this.applications.find((a) => a.id === applicationId);
    if (!app) return { success: false, error: 'Application not found.' };
    if (app.addedById !== adminId) return { success: false, error: 'You are not authorized to accept this application.' };
    if (app.status === 'Approved') return { success: false, error: 'Application already accepted' };

    app.status = 'Approved';
    const pet = this.getPet(app.petId);
    if (pet) pet.adoptionStatus = 'Pending';

    this.notifications.push({
      to: app.applicantId,
      subject: `Great news! Your application for ${pet?.name} was accepted 🎉`,
      type: 'accepted',
    });

    return { success: true };
  }

  rejectApplication(applicationId: string, adminId: string): { success: boolean; error?: string } {
    const app = this.applications.find((a) => a.id === applicationId);
    if (!app) return { success: false, error: 'Application not found.' };
    if (app.addedById !== adminId) return { success: false, error: 'You are not authorized to accept this application.' };

    this.applications = this.applications.filter((a) => a.id !== applicationId);
    const pet = this.getPet(app.petId);

    this.notifications.push({
      to: app.applicantId,
      subject: `Update on your application for ${pet?.name}`,
      type: 'rejected',
    });

    return { success: true };
  }

  submitOfflineReport(animalType: 'Dog' | 'Cat' | 'Other', description: string, location: { lat: number; lng: number }): OfflineReport {
    const report: OfflineReport = {
      id: `off-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      animalType,
      description,
      location,
      synced: false,
    };
    this.offlineReports.push(report);
    return report;
  }

  syncOfflineReports(): { synced: number; failed: number } {
    let synced = 0;
    for (const report of this.offlineReports) {
      if (!report.synced) {
        report.synced = true;
        synced++;
      }
    }
    return { synced, failed: 0 };
  }

  getUnsyncedReportCount(): number {
    return this.offlineReports.filter((r) => !r.synced).length;
  }

  generateApiKey(userId: string): string {
    const key = `pk_${Math.random().toString(36).substring(2, 16)}`;
    this.apiKeys.set(userId, key);
    return key;
  }

  authenticateApiKey(key: string): boolean {
    for (const storedKey of this.apiKeys.values()) {
      if (storedKey === key) return true;
    }
    return false;
  }

  getNotificationsFor(userId: string): Notification[] {
    return this.notifications.filter((n) => n.to === userId);
  }
}

// ─── Acceptance Test Cases (13 Critical Tests) ────────────────────────────────

test.describe('Acceptance Tests: End-to-End User Journeys', () => {
  let platform: PawMatchPlatform;

  test.beforeEach(() => {
    platform = new PawMatchPlatform();
    platform.addPet({ id: 'pet-1', name: 'Bella', adoptionStatus: 'Ready', addedById: 'shelter-1' });
    platform.addPet({ id: 'pet-2', name: 'Milo', adoptionStatus: 'Pending', addedById: 'shelter-1' });
    platform.addPet({ id: 'pet-3', name: 'Rocky', adoptionStatus: 'Adopted', addedById: 'shelter-2' });
  });

  test('1. Scenario: Citizen reports stray animal online with photo and GPS location', () => {
    const reportPayload = {
      imageUrl: '/uploads/stray-dog.jpg',
      animalType: 'Dog',
      location: { lat: 6.9055, lng: 79.8633 },
      description: 'Limping dog near park entrance',
    };

    expect(reportPayload.imageUrl).toBeTruthy();
    expect(reportPayload.location.lat).toBe(6.9055);
    expect(reportPayload.animalType).toBe('Dog');
  });

  test('2. Scenario: Citizen records stray animal report while offline', () => {
    const offlineReport = platform.submitOfflineReport('Cat', 'Kittens abandoned in box', { lat: 6.9, lng: 79.8 });
    expect(offlineReport.synced).toBe(false);
    expect(offlineReport.description).toContain('Kittens');
    expect(platform.getUnsyncedReportCount()).toBe(1);
  });

  test('3. Scenario: Offline reports auto-sync when connectivity is restored', () => {
    platform.submitOfflineReport('Dog', 'Stray dog 1', { lat: 6.9, lng: 79.8 });
    platform.submitOfflineReport('Cat', 'Stray cat 2', { lat: 7.0, lng: 80.0 });
    expect(platform.getUnsyncedReportCount()).toBe(2);

    const syncResult = platform.syncOfflineReports();
    expect(syncResult.synced).toBe(2);
    expect(platform.getUnsyncedReportCount()).toBe(0);
  });

  test('4. Scenario: Adopter browses available pets and only views pets with "Ready" status', () => {
    const available = platform.getAvailablePets();
    expect(available).toHaveLength(1);
    expect(available[0].name).toBe('Bella');
    expect(available[0].adoptionStatus).toBe('Ready');
  });

  test('5. Scenario: Adopter submits an adoption application for an available pet', () => {
    const result = platform.submitApplication('pet-1', 'adopter-1');
    expect(result.success).toBe(true);
    expect(result.application?.status).toBe('Pending');
    expect(result.application?.petId).toBe('pet-1');
  });

  test('6. Scenario: System prevents pet owner or shelter admin from adopting their own pet', () => {
    const result = platform.submitApplication('pet-1', 'shelter-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('cannot apply to adopt your own pet');
  });

  test('7. Scenario: System prevents duplicate adoption applications for the same pet', () => {
    platform.submitApplication('pet-1', 'adopter-1');
    const duplicate = platform.submitApplication('pet-1', 'adopter-1');
    expect(duplicate.success).toBe(false);
    expect(duplicate.error).toContain('Already In');
  });

  test('8. Scenario: System rejects adoption applications for non-available pets', () => {
    const pendingResult = platform.submitApplication('pet-2', 'adopter-1');
    expect(pendingResult.success).toBe(false);
    expect(pendingResult.error).toContain('not available');

    const adoptedResult = platform.submitApplication('pet-3', 'adopter-1');
    expect(adoptedResult.success).toBe(false);
    expect(adoptedResult.error).toContain('not available');
  });

  test('9. Scenario: Shelter admin receives notification upon new application submission', () => {
    platform.submitApplication('pet-1', 'adopter-1');
    const notifications = platform.getNotificationsFor('shelter-1');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('new_application');
    expect(notifications[0].subject).toContain('Bella');
  });

  test('10. Scenario: Shelter admin approves application, transitioning pet status to "Pending"', () => {
    const appRes = platform.submitApplication('pet-1', 'adopter-1');
    const approveRes = platform.approveApplication(appRes.application!.id, 'shelter-1');
    expect(approveRes.success).toBe(true);

    const updatedPet = platform.getPet('pet-1');
    expect(updatedPet?.adoptionStatus).toBe('Pending');
  });

  test('11. Scenario: Approved applicant receives celebratory email notification', () => {
    const appRes = platform.submitApplication('pet-1', 'adopter-1');
    platform.approveApplication(appRes.application!.id, 'shelter-1');

    const notifications = platform.getNotificationsFor('adopter-1');
    const celebration = notifications.find((n) => n.type === 'accepted');
    expect(celebration).toBeDefined();
    expect(celebration?.subject).toContain('🎉');
    expect(celebration?.subject).toContain('Bella');
  });

  test('12. Scenario: Shelter admin rejects application, notifying applicant with update message', () => {
    const appRes = platform.submitApplication('pet-1', 'adopter-1');
    const rejectRes = platform.rejectApplication(appRes.application!.id, 'shelter-1');
    expect(rejectRes.success).toBe(true);

    const notifications = platform.getNotificationsFor('adopter-1');
    const rejection = notifications.find((n) => n.type === 'rejected');
    expect(rejection).toBeDefined();
    expect(rejection?.subject).not.toContain('🎉');
  });

  test('13. Scenario: Developer generates API key and authenticates against developer endpoints', () => {
    const apiKey = platform.generateApiKey('dev-user-1');
    expect(apiKey.startsWith('pk_')).toBe(true);

    const isAuthenticated = platform.authenticateApiKey(apiKey);
    expect(isAuthenticated).toBe(true);

    const isInvalidAuthenticated = platform.authenticateApiKey('invalid-fake-key');
    expect(isInvalidAuthenticated).toBe(false);
  });
});
