export const MAX_SIDE = 1600;
export const PNG_LIMIT = 500 * 1024;
export const WEBP_QUALITY = 0.85;
export const JPEG_QUALITY = 0.9;

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export function extensionFor(mime: string): string {
  return EXT[mime] ?? 'bin';
}

/** `YYYYMMDD-HHmmss-<4 random chars>.<ext>` (local time). */
export function attachmentName(ext: string, d = new Date(), rand = randomChars(4)): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${rand}.${ext}`;
}

export function randomChars(n: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => chars[b % chars.length]).join('');
}

/** Target size keeping aspect ratio so the longer side is at most MAX_SIDE. */
export function fitSize(w: number, h: number, max = MAX_SIDE): { width: number; height: number; scaled: boolean } {
  const long = Math.max(w, h);
  if (long <= max) return { width: w, height: h, scaled: false };
  const k = max / long;
  return { width: Math.round(w * k), height: Math.round(h * k), scaled: true };
}

export type Plan =
  | { kind: 'original' } // upload the file as-is
  | { kind: 'encode'; mime: 'image/png' | 'image/jpeg' | 'image/webp'; quality?: number };

/** First encoding decision (before we know the encoded size). */
export function initialPlan(type: string, size: number, scaled: boolean): Plan {
  if (type === 'image/gif' || type === 'image/svg+xml') return { kind: 'original' }; // keep animation / vectors
  if (type === 'image/png') {
    if (!scaled && size <= PNG_LIMIT) return { kind: 'original' };
    return { kind: 'encode', mime: 'image/png' };
  }
  if ((type === 'image/jpeg' || type === 'image/webp') && !scaled) return { kind: 'original' };
  if (type === 'image/webp') return { kind: 'encode', mime: 'image/webp', quality: WEBP_QUALITY };
  return { kind: 'encode', mime: 'image/jpeg', quality: JPEG_QUALITY }; // jpeg, heic, bmp, ...
}

/** A PNG that is still over the limit after resizing becomes WebP. */
export function needsWebp(encodedType: string, encodedSize: number): boolean {
  return encodedType === 'image/png' && encodedSize > PNG_LIMIT;
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の変換に失敗しました'))), mime, quality),
  );
}

/** Resize (long side ≤ 1600px) and pick the format. Runs in the browser. */
export async function prepareImage(file: File): Promise<{ blob: Blob; ext: string }> {
  const type = file.type || 'image/png';
  if (type === 'image/gif' || type === 'image/svg+xml') return { blob: file, ext: extensionFor(type) };
  const bmp = await createImageBitmap(file);
  const fit = fitSize(bmp.width, bmp.height);
  const plan = initialPlan(type, file.size, fit.scaled);
  if (plan.kind === 'original') {
    bmp.close();
    return { blob: file, ext: extensionFor(type) };
  }
  const canvas = document.createElement('canvas');
  canvas.width = fit.width;
  canvas.height = fit.height;
  const ctx = canvas.getContext('2d')!;
  if (plan.mime === 'image/jpeg') {
    ctx.fillStyle = '#fff'; // JPEG has no alpha
    ctx.fillRect(0, 0, fit.width, fit.height);
  }
  ctx.drawImage(bmp, 0, 0, fit.width, fit.height);
  bmp.close();
  let blob = await toBlob(canvas, plan.mime, plan.quality);
  if (needsWebp(blob.type, blob.size)) {
    blob = await toBlob(canvas, 'image/webp', WEBP_QUALITY);
    // Safari may not encode WebP and silently returns PNG: fall back to JPEG.
    if (blob.type !== 'image/webp') {
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, fit.width, fit.height);
      blob = await toBlob(canvas, 'image/jpeg', WEBP_QUALITY);
    }
  }
  return { blob, ext: extensionFor(blob.type) };
}
