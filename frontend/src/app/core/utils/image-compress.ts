export interface CompressImageOptions {
  /** Target upper bound for the output size. Default 1 MB. */
  maxBytes?: number;
  /** Longest side after downscaling; images are never upscaled. Default 1600 px. */
  maxDimension?: number;
  /** Output type. Default image/jpeg. */
  mimeType?: string;
}

const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_MIME = 'image/jpeg';
const START_QUALITY = 0.9;
const QUALITY_STEP = 0.1;
const MIN_QUALITY = 0.4;
/** Formats we must not re-encode: animation or vector data would be lost. */
const SKIPPED_IMAGE_TYPES = new Set(['image/gif', 'image/svg+xml']);
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Pure decision: only big, re-encodable raster images are worth compressing. */
export function shouldCompress(file: File, maxBytes: number): boolean {
  if (!file.type.startsWith('image/')) return false;
  if (SKIPPED_IMAGE_TYPES.has(file.type)) return false;
  return file.size > maxBytes;
}

/** `scan.png` + image/jpeg -> `scan.jpg`; names without an extension get one appended. */
export function compressedFileName(originalName: string, mimeType: string): string {
  const extension = EXTENSIONS[mimeType] ?? 'jpg';
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  return `${base || 'image'}.${extension}`;
}

function scaledSize(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const ratio = maxDimension / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Downscales and re-encodes a big photo so phone-camera uploads (often 4-8 MB)
 * fit the server's limit. Quality drops step by step until the file fits
 * `maxBytes`. PDFs, other non-images and already-small files are returned
 * untouched (the same File instance), as is the original whenever compression
 * is impossible or would not make the file smaller.
 */
export async function compressImage(file: File, opts: CompressImageOptions = {}): Promise<File> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDimension = opts.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const mimeType = opts.mimeType ?? DEFAULT_MIME;
  if (!shouldCompress(file, maxBytes)) return file;
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // undecodable image: let the server's own validation answer
  }

  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height, maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    if (mimeType === 'image/jpeg') {
      // JPEG has no alpha; paint white so transparent PNGs do not turn black.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, 0, 0, width, height);

    let best: Blob | null = null;
    for (let quality = START_QUALITY; quality >= MIN_QUALITY - 1e-9; quality -= QUALITY_STEP) {
      const blob = await canvasToBlob(canvas, mimeType, Number(quality.toFixed(2)));
      if (!blob) return file;
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= maxBytes) break;
    }
    if (!best || best.size >= file.size) return file;
    return new File([best], compressedFileName(file.name, mimeType), {
      type: mimeType,
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close?.();
  }
}
