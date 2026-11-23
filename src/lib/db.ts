import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { NoteIndexEntry } from './indexer';

export interface StoredNote {
  path: string;
  sha: string;
  content: string;
  index: NoteIndexEntry;
}

export interface AttachmentRef {
  path: string;
  sha: string;
}

export interface VaultState {
  /** owner/repo/branch the cache belongs to */
  source: string;
  headSha: string | null;
  attachments: Record<string, AttachmentRef>; // basename -> ref
  syncedAt: number;
}

export interface Draft {
  key: string; // note path, or "new:<id>"
  title: string;
  aliases: string[];
  tags: string[];
  status: string;
  summary: string;
  body: string;
  baseSha: string | null;
  savedAt: number;
}

interface Schema extends DBSchema {
  notes: { key: string; value: StoredNote };
  meta: { key: string; value: VaultState };
  drafts: { key: string; value: Draft };
  images: { key: string; value: Blob };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

function db(): Promise<IDBPDatabase<Schema>> {
  if (!dbp) {
    dbp = openDB<Schema>('math-dict', 1, {
      upgrade(d) {
        d.createObjectStore('notes', { keyPath: 'path' });
        d.createObjectStore('meta');
        d.createObjectStore('drafts', { keyPath: 'key' });
        d.createObjectStore('images');
      },
    });
  }
  return dbp;
}

export async function loadAll(): Promise<{ notes: StoredNote[]; state: VaultState | undefined }> {
  const d = await db();
  const tx = d.transaction(['notes', 'meta']);
  const [notes, state] = await Promise.all([tx.objectStore('notes').getAll(), tx.objectStore('meta').get('state')]);
  await tx.done;
  return { notes, state };
}

/** Apply a sync result in a single transaction. */
export async function applyChanges(put: StoredNote[], remove: string[], state: VaultState): Promise<void> {
  const d = await db();
  const tx = d.transaction(['notes', 'meta'], 'readwrite');
  const notes = tx.objectStore('notes');
  for (const n of put) void notes.put(n);
  for (const p of remove) void notes.delete(p);
  void tx.objectStore('meta').put(state, 'state');
  await tx.done;
}

export async function clearVault(): Promise<void> {
  const d = await db();
  const tx = d.transaction(['notes', 'meta', 'images'], 'readwrite');
  await Promise.all([tx.objectStore('notes').clear(), tx.objectStore('meta').clear(), tx.objectStore('images').clear()]);
  await tx.done;
}

export async function getDraft(key: string): Promise<Draft | undefined> {
  return (await db()).get('drafts', key);
}

export async function putDraft(d: Draft): Promise<void> {
  await (await db()).put('drafts', d);
}

export async function deleteDraft(key: string): Promise<void> {
  await (await db()).delete('drafts', key);
}

export async function listDrafts(): Promise<Draft[]> {
  return (await db()).getAll('drafts');
}

export async function getImage(sha: string): Promise<Blob | undefined> {
  return (await db()).get('images', sha);
}

export async function putImage(sha: string, blob: Blob): Promise<void> {
  await (await db()).put('images', blob, sha);
}
