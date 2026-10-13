import type { DraftFileStore } from './registration-draft.service';

const DB_NAME = 'ukams_registration_draft_files';
const STORE_NAME = 'files';
const DB_VERSION = 1;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Holds the draft's photo/document data URLs outside localStorage (which
 * silently fails at about 5 MB). Every write replaces the whole set in one
 * transaction, so files removed from the form never linger.
 */
class IndexedDbFileStore implements DraftFileStore {
  async saveAll(entries: Record<string, string>): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (const [key, value] of Object.entries(entries)) store.put(value, key);
      await transactionDone(tx);
    } finally {
      db.close();
    }
  }

  async loadAll(): Promise<Record<string, string>> {
    const db = await openDatabase();
    try {
      const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
      const keys = (await requestToPromise(store.getAllKeys())) as string[];
      const values = (await requestToPromise(store.getAll())) as string[];
      return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
    } finally {
      db.close();
    }
  }

  async clear(): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      await transactionDone(tx);
    } finally {
      db.close();
    }
  }
}

/** Null when IndexedDB is missing (very old browsers, some private modes): callers keep the inline draft. */
export function createIndexedDbFileStore(): DraftFileStore | null {
  return typeof indexedDB === 'undefined' || !indexedDB ? null : new IndexedDbFileStore();
}
