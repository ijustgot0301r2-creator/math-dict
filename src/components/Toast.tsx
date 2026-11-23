import { useEffect, useSyncExternalStore } from 'react';

let current: { id: number; text: string; error: boolean } | null = null;
let seq = 0;
const listeners = new Set<() => void>();

/** Show a short message at the bottom of the screen. */
export function toast(text: string, error = false): void {
  current = { id: ++seq, text, error };
  for (const l of listeners) l();
}

function dismiss(): void {
  current = null;
  for (const l of listeners) l();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export default function ToastHost() {
  const t = useSyncExternalStore(subscribe, () => current);
  useEffect(() => {
    if (!t) return;
    const id = t.id;
    const timer = setTimeout(
      () => {
        if (current?.id === id) {
          current = null;
          for (const l of listeners) l();
        }
      },
      t.error ? 8000 : 5000,
    );
    return () => clearTimeout(timer);
  }, [t]);
  if (!t) return null;
  return (
    <div className={`toast ${t.error ? 'error' : ''}`} role="status" onClick={dismiss}>
      {t.text}
    </div>
  );
}
