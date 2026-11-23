// UTF-8 / base64 helpers (btoa/atob only handle Latin-1).

export function utf8ToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64ToUtf8(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64));
}

/** Encode each path segment for use in a URL path (keeps `/`). */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
