import { compressImage } from '../../core/utils/image-compress';

/**
 * Photos from cheap phone cameras are 4-8 MB. With the simplified UI they are
 * shrunk (about 1 MB) before the size check and the upload; otherwise the file
 * is used as picked.
 */
export function prepareUpload(file: File, compress: boolean): Promise<File> {
  return compress ? compressImage(file) : Promise.resolve(file);
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
