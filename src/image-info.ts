/**
 * Raster image type and size from the bytes alone (PNG, JPEG, GIF, WebP).
 *
 * The type is read from the magic bytes, never from a claimed MIME type or a file
 * extension, so a renamed or mislabelled file is caught. `storeCustom` uses the type
 * check for uploads; the screenshot extra also needs the pixel size, to crop a
 * focus region without decoding the image.
 */

export type RasterMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

const SNIFF: Array<[RasterMime, (b: Uint8Array) => boolean]> = [
  ['image/png', (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/gif', (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38],
  ['image/webp', (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50],
];

/** The raster type of `bytes`, or undefined when it is none of PNG, JPEG, GIF, WebP. */
export function sniffMime(bytes: Uint8Array): RasterMime | undefined {
  return SNIFF.find(([, test]) => test(bytes))?.[0];
}

export interface ImageInfo {
  mime: RasterMime;
  width: number;
  height: number;
}

/** Type and pixel size of a raster image, or null when the bytes are not one we can read. */
export function imageInfo(b: Uint8Array): ImageInfo | null {
  const mime = sniffMime(b);
  if (!mime) return null;
  const u16be = (i: number) => ((b[i]! << 8) | b[i + 1]!) >>> 0;
  const u16le = (i: number) => (b[i]! | (b[i + 1]! << 8)) >>> 0;
  const u24le = (i: number) => (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16)) >>> 0;
  const u32be = (i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
  const ok = (width: number, height: number): ImageInfo | null => (width > 0 && height > 0 ? { mime, width, height } : null);
  if (b.length < 30) return null;
  switch (mime) {
    case 'image/png':
      return ok(u32be(16), u32be(20));
    case 'image/gif':
      return ok(u16le(6), u16le(8));
    case 'image/webp': {
      const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
      if (chunk === 'VP8 ') return ok(u16le(26) & 0x3fff, u16le(28) & 0x3fff);
      if (chunk === 'VP8L') return ok(1 + (((b[22]! & 0x3f) << 8) | b[21]!), 1 + (((b[24]! & 0x0f) << 10) | (b[23]! << 2) | ((b[22]! & 0xc0) >> 6)));
      if (chunk === 'VP8X') return ok(1 + u24le(24), 1 + u24le(27));
      return null;
    }
    case 'image/jpeg': {
      // Walk the marker segments to the first start-of-frame (SOF0..SOF15 bar DHT, JPG, DAC).
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null;
        const m = b[i + 1]!;
        if (m === 0xff) {
          i += 1;
          continue;
        }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return ok(u16be(i + 7), u16be(i + 5));
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
          i += 2;
          continue;
        }
        i += 2 + u16be(i + 2);
      }
      return null;
    }
  }
}
