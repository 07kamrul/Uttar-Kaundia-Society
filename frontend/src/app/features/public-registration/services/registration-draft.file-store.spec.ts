import { FormBuilder, FormGroup } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApplicableDocGroup, buildPropertyGroup, buildRegistrationForm, propertiesArray, applicableDocsArray } from '../registration-form.builder';
import { DraftFileStore, RegistrationDraftService } from './registration-draft.service';

const DRAFT_KEY = 'ukams_registration_draft';
const PHOTO = 'data:image/jpeg;base64,PHOTO';
const DOC = 'data:image/jpeg;base64,DOC';

class MemoryStorage {
  private readonly entries = new Map<string, string>();
  get length(): number {
    return this.entries.size;
  }
  clear(): void {
    this.entries.clear();
  }
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.entries.delete(key);
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }
}

class FakeFileStore implements DraftFileStore {
  data: Record<string, string> = {};
  failWrites = false;
  failReads = false;
  async saveAll(entries: Record<string, string>): Promise<void> {
    if (this.failWrites) throw new Error('quota');
    this.data = { ...entries };
  }
  async loadAll(): Promise<Record<string, string>> {
    if (this.failReads) throw new Error('blocked');
    return { ...this.data };
  }
  async clear(): Promise<void> {
    this.data = {};
  }
}

describe('RegistrationDraftService with an IndexedDB-style file store', () => {
  let fb: FormBuilder;
  let service: RegistrationDraftService;
  let store: FakeFileStore;
  let form: FormGroup;

  function fillForm(target: FormGroup): void {
    target.patchValue({ fullName: 'রহিম', memberPhoto: PHOTO });
    const property = buildPropertyGroup(fb);
    applicableDocsArray(property).push(buildApplicableDocGroup(fb, 'খতিয়ান/পর্চা'));
    propertiesArray(target).push(property);
    property.get('applicableDocs')!.get('0')!.patchValue({ fileName: 'a.jpg', fileDataUrl: DOC });
  }

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
    fb = new FormBuilder();
    service = new RegistrationDraftService();
    store = new FakeFileStore();
    service.useFileStore(store);
    form = buildRegistrationForm(fb);
    fillForm(form);
  });

  afterEach(() => service.unwatch());

  it('keeps file blobs out of localStorage and puts them in the store', async () => {
    service.saveNow(form, 2);
    await service.whenFilesSaved();

    const raw = localStorage.getItem(DRAFT_KEY)!;
    expect(raw).not.toContain('PHOTO');
    expect(raw).not.toContain('DOC');
    expect(Object.values(store.data)).toEqual(expect.arrayContaining([PHOTO, DOC]));
    expect(service.peekDraft()!.formValue['fullName']).toBe('রহিম');
  });

  it('restores text synchronously and the files from the store afterwards', async () => {
    service.saveNow(form, 3);
    await service.whenFilesSaved();

    const fresh = buildRegistrationForm(fb);
    const draft = service.peekDraft()!;
    service.restore(fresh, fb, draft);
    expect(fresh.get('fullName')!.value).toBe('রহিম');
    expect(fresh.get('memberPhoto')!.value).toBe('');

    await service.restoreFiles(fresh, draft);
    expect(fresh.get('memberPhoto')!.value).toBe(PHOTO);
    expect(propertiesArray(fresh).at(0).get('applicableDocs')!.get('0')!.value.fileDataUrl).toBe(DOC);
  });

  it('never loses text fields when the store cannot be written: files fall back inline', async () => {
    store.failWrites = true;
    service.saveNow(form, 2);
    await service.whenFilesSaved();

    const draft = service.peekDraft()!;
    expect(draft.formValue['fullName']).toBe('রহিম');
    expect(draft.formValue['memberPhoto']).toBe(PHOTO);
  });

  it('keeps the text draft when the store cannot be read', async () => {
    service.saveNow(form, 2);
    await service.whenFilesSaved();
    store.failReads = true;

    const fresh = buildRegistrationForm(fb);
    const draft = service.peekDraft()!;
    service.restore(fresh, fb, draft);
    await expect(service.restoreFiles(fresh, draft)).resolves.toBeUndefined();
    expect(fresh.get('fullName')!.value).toBe('রহিম');
    expect(fresh.get('memberPhoto')!.value).toBe('');
  });

  it('clear() also empties the store', async () => {
    service.saveNow(form, 2);
    await service.whenFilesSaved();
    service.clear();
    await service.whenFilesSaved();
    expect(store.data).toEqual({});
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('without a store (flags off) keeps the legacy inline behaviour', () => {
    const legacy = new RegistrationDraftService();
    legacy.saveNow(form, 1);
    expect(legacy.peekDraft()!.formValue['memberPhoto']).toBe(PHOTO);
  });
});

describe('IndexedDB draft store availability', () => {
  it('createIndexedDbFileStore returns null when indexedDB does not exist', async () => {
    const { createIndexedDbFileStore } = await import('./indexed-db-file-store');
    const original = (globalThis as { indexedDB?: unknown }).indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });
    try {
      expect(createIndexedDbFileStore()).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: original, configurable: true });
    }
  });
});
