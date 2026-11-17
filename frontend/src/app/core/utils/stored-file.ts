/**
 * Marker for a file that is already stored on the server (applicant
 * correction flow). Form controls that normally hold a `data:` URL for a new
 * upload may instead hold `stored:<relative path>`: the file is kept as-is
 * and only its path is sent back, never re-uploaded.
 */
export const STORED_FILE_PREFIX = 'stored:';

export function toStoredFileValue(path: string): string {
  return `${STORED_FILE_PREFIX}${path}`;
}

export function storedFilePath(value: string | null | undefined): string | null {
  return value?.startsWith(STORED_FILE_PREFIX) ? value.slice(STORED_FILE_PREFIX.length) : null;
}

export function isNewUpload(value: string | null | undefined): value is string {
  return !!value && value.startsWith('data:');
}

/** Last path segment, for showing a kept document's name. */
export function storedFileName(path: string): string {
  return path.split('/').pop() ?? path;
}
