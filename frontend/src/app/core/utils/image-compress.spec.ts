import { compressedFileName, compressImage, shouldCompress } from './image-compress';

const MB = 1_000_000;
const fileOf = (name: string, type: string, size: number) =>
  new File([new Uint8Array(size)], name, { type });

describe('shouldCompress', () => {
  it('skips PDFs and other non-images', () => {
    expect(shouldCompress(fileOf('a.pdf', 'application/pdf', 5 * MB), 1 * MB)).toBe(false);
    expect(shouldCompress(fileOf('a.txt', 'text/plain', 5 * MB), 1 * MB)).toBe(false);
    expect(shouldCompress(fileOf('a', '', 5 * MB), 1 * MB)).toBe(false);
  });

  it('skips images already at or under the limit', () => {
    expect(shouldCompress(fileOf('a.jpg', 'image/jpeg', 1 * MB), 1 * MB)).toBe(false);
    expect(shouldCompress(fileOf('a.jpg', 'image/jpeg', 10), 1 * MB)).toBe(false);
  });

  it('skips animated/vector formats it cannot safely re-encode', () => {
    expect(shouldCompress(fileOf('a.gif', 'image/gif', 5 * MB), 1 * MB)).toBe(false);
    expect(shouldCompress(fileOf('a.svg', 'image/svg+xml', 5 * MB), 1 * MB)).toBe(false);
  });

  it('compresses big jpeg/png/webp/heic', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) {
      expect(shouldCompress(fileOf('a', type, 3 * MB), 1 * MB)).toBe(true);
    }
  });
});

describe('compressedFileName', () => {
  it('swaps the extension to match the output type', () => {
    expect(compressedFileName('photo.png', 'image/jpeg')).toBe('photo.jpg');
    expect(compressedFileName('photo.JPEG', 'image/jpeg')).toBe('photo.jpg');
    expect(compressedFileName('photo.jpg', 'image/webp')).toBe('photo.webp');
  });

  it('handles dots, no extension and empty names', () => {
    expect(compressedFileName('my.nid.front.png', 'image/jpeg')).toBe('my.nid.front.jpg');
    expect(compressedFileName('scan', 'image/jpeg')).toBe('scan.jpg');
    expect(compressedFileName('', 'image/jpeg')).toBe('image.jpg');
  });
});

describe('compressImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the very same File for PDFs', async () => {
    const pdf = fileOf('a.pdf', 'application/pdf', 5 * MB);
    expect(await compressImage(pdf)).toBe(pdf);
  });

  it('returns the very same File when already small', async () => {
    const small = fileOf('a.jpg', 'image/jpeg', 100);
    expect(await compressImage(small)).toBe(small);
  });

  it('returns the original when image decoding is unavailable or fails', async () => {
    const big = fileOf('a.jpg', 'image/jpeg', 3 * MB);
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await compressImage(big)).toBe(big);

    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad image')));
    expect(await compressImage(big)).toBe(big);
  });

  describe('with a mocked canvas', () => {
    const close = vi.fn();
    let drawSize: { w: number; h: number } | null;
    let qualities: number[];

    function mockEnvironment(opts: { width: number; height: number; sizeAt: (q: number) => number }) {
      drawSize = null;
      qualities = [];
      close.mockClear();
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn().mockResolvedValue({ width: opts.width, height: opts.height, close }),
      );
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '',
          fillRect: () => undefined,
          drawImage: () => {
            drawSize = { w: canvas.width, h: canvas.height };
          },
        }),
        toBlob: (cb: (b: Blob | null) => void, type: string, q: number) => {
          qualities.push(q);
          cb(new Blob([new Uint8Array(opts.sizeAt(q))], { type }));
        },
      };
      const realCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
        tag === 'canvas' ? canvas : realCreate(tag)) as typeof document.createElement);
    }

    it('downscales to maxDimension keeping aspect ratio and renames to .jpg', async () => {
      mockEnvironment({ width: 4000, height: 3000, sizeAt: () => 200_000 });
      const out = await compressImage(fileOf('nid.png', 'image/png', 3 * MB));
      expect(drawSize).toEqual({ w: 1600, h: 1200 });
      expect(out.name).toBe('nid.jpg');
      expect(out.type).toBe('image/jpeg');
      expect(out.size).toBe(200_000);
      expect(close).toHaveBeenCalled();
    });

    it('does not upscale small-dimension images', async () => {
      mockEnvironment({ width: 800, height: 600, sizeAt: () => 200_000 });
      await compressImage(fileOf('a.jpg', 'image/jpeg', 3 * MB));
      expect(drawSize).toEqual({ w: 800, h: 600 });
    });

    it('lowers quality step by step until under maxBytes', async () => {
      mockEnvironment({ width: 1000, height: 1000, sizeAt: (q) => (q > 0.6 ? 2 * MB : 900_000) });
      const out = await compressImage(fileOf('a.jpg', 'image/jpeg', 3 * MB));
      expect(out.size).toBe(900_000);
      expect(qualities.length).toBeGreaterThan(1);
      expect(qualities).toEqual([...qualities].sort((a, b) => b - a));
      expect(qualities[qualities.length - 1]).toBeLessThanOrEqual(0.6);
    });

    it('returns the smallest attempt when the limit cannot be met, with bounded retries', async () => {
      mockEnvironment({ width: 1000, height: 1000, sizeAt: () => 2 * MB });
      const out = await compressImage(fileOf('a.jpg', 'image/jpeg', 3 * MB));
      expect(out.size).toBe(2 * MB);
      expect(qualities.length).toBeLessThan(15);
    });

    it('returns the original if re-encoding made the file bigger', async () => {
      mockEnvironment({ width: 1000, height: 1000, sizeAt: () => 5 * MB });
      const original = fileOf('a.jpg', 'image/jpeg', 3 * MB);
      expect(await compressImage(original)).toBe(original);
    });

    it('returns the original if the canvas cannot produce a blob', async () => {
      mockEnvironment({ width: 1000, height: 1000, sizeAt: () => 1 });
      const original = fileOf('a.jpg', 'image/jpeg', 3 * MB);
      vi.mocked(document.createElement).mockImplementation(((tag: string) =>
        tag === 'canvas'
          ? {
              width: 0,
              height: 0,
              getContext: () => ({ fillRect: () => undefined, drawImage: () => undefined }),
              toBlob: (cb: (b: Blob | null) => void) => cb(null),
            }
          : document.createElement(tag)) as typeof document.createElement);
      expect(await compressImage(original)).toBe(original);
    });

    it('honours custom options', async () => {
      mockEnvironment({ width: 2000, height: 1000, sizeAt: () => 50_000 });
      const out = await compressImage(fileOf('a.jpg', 'image/jpeg', 3 * MB), {
        maxBytes: 100_000,
        maxDimension: 500,
        mimeType: 'image/webp',
      });
      expect(drawSize).toEqual({ w: 500, h: 250 });
      expect(out.name).toBe('a.webp');
      expect(out.type).toBe('image/webp');
    });
  });
});
