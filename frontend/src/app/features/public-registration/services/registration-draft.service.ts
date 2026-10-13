import { Injectable, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup } from '@angular/forms';
import { debounceTime, Subscription } from 'rxjs';
import {
  applicableDocsArray,
  buildApplicableDocGroup,
  buildNomineeGroup,
  buildPropertyGroup,
  nomineesArray,
  propertiesArray,
} from '../registration-form.builder';

const DRAFT_KEY = 'ukams_registration_draft';
const DRAFT_SCHEMA_VERSION = 1;
const AUTOSAVE_DEBOUNCE_MS = 400;

// Fee-derived values are resolved from the live fee settings, never from a
// draft: a stale draft must not be able to carry an outdated amount forward.
const NON_RESTORABLE_FIELDS = ['admissionFee', 'subscription'];

/** Where file data URLs live when they are kept out of localStorage (IndexedDB in production). */
export interface DraftFileStore {
  /** Replaces the stored set with exactly these entries. */
  saveAll(entries: Record<string, string>): Promise<void>;
  loadAll(): Promise<Record<string, string>>;
  clear(): Promise<void>;
}

export interface RegistrationDraft {
  schemaVersion: number;
  currentStep: number;
  lastSaved: string;
  formValue: Record<string, unknown>;
  /** Paths (see collectFilePaths) whose data URL is held in the file store, not in formValue. */
  fileRefs?: string[];
}

const TOP_LEVEL_FILE_FIELDS = ['memberPhoto', 'receiptFileDataUrl', 'memberSignature'];

/** Lists every form path that holds a file data URL. */
function collectFilePaths(formValue: Record<string, any>): string[] {
  const paths = TOP_LEVEL_FILE_FIELDS.filter((f) => typeof formValue[f] === 'string' && formValue[f]);
  const properties = Array.isArray(formValue['properties']) ? formValue['properties'] : [];
  properties.forEach((property: Record<string, any>, i: number) => {
    const docs = Array.isArray(property['applicableDocs']) ? property['applicableDocs'] : [];
    docs.forEach((doc: Record<string, any>, j: number) => {
      if (doc['fileDataUrl']) paths.push(`properties.${i}.applicableDocs.${j}.fileDataUrl`);
    });
  });
  return paths;
}

function getPath(root: Record<string, any>, path: string): string {
  return path.split('.').reduce<any>((node, part) => node?.[part], root) as string;
}

function setPath(root: Record<string, any>, path: string, value: string): void {
  const parts = path.split('.');
  const last = parts.pop() as string;
  const parent = parts.reduce<any>((node, part) => node?.[part], root);
  if (parent) parent[last] = value;
}

@Injectable({ providedIn: 'root' })
export class RegistrationDraftService {
  readonly lastSaved = signal<string | null>(null);

  private watchSubscription?: Subscription;
  private fileStore: DraftFileStore | null = null;
  private pendingFileWrite: Promise<void> = Promise.resolve();

  /**
   * Keeps photo/document blobs in `store` instead of localStorage. Without a
   * store (flag off, or IndexedDB unavailable) files stay inline as before.
   */
  useFileStore(store: DraftFileStore | null): void {
    this.fileStore = store;
  }

  /** Resolves once the latest background file write (or clear) has finished. */
  whenFilesSaved(): Promise<void> {
    return this.pendingFileWrite;
  }

  /**
   * Wires debounced autosave to form value changes; call once per form instance.
   * Replaces any previous watcher so the old form (e.g. after discarding a
   * draft) stops being observed — the root-provided service would otherwise
   * keep every abandoned form subscription alive for the whole session.
   */
  watch(form: FormGroup, getCurrentStep: () => number): void {
    this.unwatch();
    this.watchSubscription = form.valueChanges
      .pipe(debounceTime(AUTOSAVE_DEBOUNCE_MS))
      .subscribe(() => this.save(form, getCurrentStep()));
  }

  /** Stops observing the currently watched form. */
  unwatch(): void {
    this.watchSubscription?.unsubscribe();
    this.watchSubscription = undefined;
  }

  saveNow(form: FormGroup, currentStep: number): void {
    this.save(form, currentStep);
  }

  private save(form: FormGroup, currentStep: number): void {
    const formValue = form.getRawValue() as Record<string, unknown>;
    for (const field of NON_RESTORABLE_FIELDS) delete formValue[field];
    const draft: RegistrationDraft = {
      schemaVersion: DRAFT_SCHEMA_VERSION,
      currentStep,
      lastSaved: new Date().toISOString(),
      formValue,
    };
    const store = this.fileStore;
    if (!store) {
      this.writeDraft(draft);
      return;
    }
    // Text first, synchronously and small; blobs follow in the background.
    const inline = structuredClone(draft);
    const paths = collectFilePaths(formValue);
    const files: Record<string, string> = {};
    for (const path of paths) {
      files[path] = getPath(formValue, path);
      setPath(draft.formValue, path, '');
    }
    draft.fileRefs = paths;
    this.writeDraft(draft);
    this.pendingFileWrite = store.saveAll(files).catch(() => {
      // The store refused (quota, blocked): fall back to inline files, which
      // may still fail on size, but the text fields are already saved.
      this.writeDraft(inline);
    });
  }

  private writeDraft(draft: RegistrationDraft): void {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      this.lastSaved.set(draft.lastSaved);
    } catch {
      // localStorage unavailable or full: degrade silently; the in-memory form is untouched.
    }
  }

  /** Returns the saved draft, or null if none exists, storage is unavailable, or its schema is stale. */
  peekDraft(): RegistrationDraft | null {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw) as RegistrationDraft;
      if (draft.schemaVersion !== DRAFT_SCHEMA_VERSION || !draft.formValue) return null;
      return draft;
    } catch {
      return null;
    }
  }

  /** Rebuilds nested FormArrays to match the draft shape, then patches all values onto the form. */
  restore(form: FormGroup, fb: FormBuilder, draft: RegistrationDraft): void {
    const value = draft.formValue as Record<string, any>;

    // Guard against drafts saved before these fields were excluded from the
    // payload — the live fee settings always win over any stored amount.
    for (const field of NON_RESTORABLE_FIELDS) delete value[field];

    const properties = propertiesArray(form);
    const draftProperties = Array.isArray(value['properties']) ? value['properties'] : [];
    properties.clear();
    draftProperties.forEach((draftProperty: Record<string, any>) => {
      const propertyGroup = buildPropertyGroup(fb);
      this.restorePropertyArrays(propertyGroup, fb, draftProperty);
      properties.push(propertyGroup);
    });

    const nominees = nomineesArray(form);
    const draftNominees = Array.isArray(value['nominees']) ? value['nominees'] : [];
    nominees.clear();
    draftNominees.forEach(() => nominees.push(buildNomineeGroup(fb)));
    if (nominees.length === 0) {
      nominees.push(buildNomineeGroup(fb));
    }

    form.patchValue(value);
    this.lastSaved.set(draft.lastSaved);
  }

  /** Puts the files kept in the store back onto a form restored from `draft`. Never throws. */
  async restoreFiles(form: FormGroup, draft: RegistrationDraft): Promise<void> {
    const store = this.fileStore;
    if (!store || !draft.fileRefs?.length) return;
    try {
      const files = await store.loadAll();
      const value = form.getRawValue() as Record<string, any>;
      for (const path of draft.fileRefs) {
        const data = files[path];
        if (data) setPath(value, path, data);
      }
      form.patchValue(value);
    } catch {
      // Files are lost, text stays; the member re-attaches them.
    }
  }

  private restorePropertyArrays(
    propertyGroup: FormGroup,
    fb: FormBuilder,
    draftProperty: Record<string, any>,
  ): void {
    const applicableDocs: FormArray = applicableDocsArray(propertyGroup);
    const draftDocs = Array.isArray(draftProperty['applicableDocs'])
      ? draftProperty['applicableDocs']
      : [];
    draftDocs.forEach((doc: Record<string, any>) =>
      applicableDocs.push(buildApplicableDocGroup(fb, doc['type'] ?? '')),
    );
  }

  clear(): void {
    if (this.fileStore) {
      this.pendingFileWrite = this.fileStore.clear().catch(() => undefined);
    }
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // localStorage unavailable — nothing to clear.
    }
    this.lastSaved.set(null);
  }
}
