/** Comparison key: NFKC + case-insensitive for Latin letters. */
export function normalizeKey(s: string): string {
  return s.normalize('NFKC').trim().toLowerCase();
}

export const NOTES_DIR = 'notes';
export const ATTACHMENTS_DIR = 'attachments';

const FORBIDDEN = /[/\\:*?"<>|#^[\]]/;

/** Returns an error message, or null if the title is usable as a file name. */
export function validateTitle(title: string): string | null {
  if (!title.trim()) return 'タイトルを入力してください';
  if (title !== title.trim()) return 'タイトルの先頭と末尾に空白は使えません';
  const m = title.match(FORBIDDEN);
  if (m) return `タイトルに「${m[0]}」は使えません（使えない文字: / \\ : * ? " < > | # ^ [ ]）`;
  if (/[\u0000-\u001f]/.test(title)) return 'タイトルに制御文字は使えません';
  if (title.startsWith('.')) return 'タイトルを「.」で始めることはできません';
  if (title.endsWith('.')) return 'タイトルを「.」で終えることはできません';
  return null;
}

export function notePath(title: string): string {
  return `${NOTES_DIR}/${title}.md`;
}

export function isNotePath(path: string): boolean {
  return path.startsWith(`${NOTES_DIR}/`) && path.toLowerCase().endsWith('.md');
}

export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? path : path.slice(i + 1);
}

export function titleFromPath(path: string): string {
  return basename(path).replace(/\.md$/i, '');
}

const IMAGE_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

export function imageMime(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXT[ext] ?? null;
}
