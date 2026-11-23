import type { AttachmentRef, StoredNote } from './db';
import type { GitHubClient, TreeEntry } from './github';
import { indexNote } from './indexer';
import { basename, imageMime, isNotePath } from './normalize';

export interface SyncPlan {
  fetch: TreeEntry[];
  remove: string[];
  attachments: Record<string, AttachmentRef>;
}

/** Decide which notes must be (re)downloaded by comparing blob SHAs with the cache. */
export function planSync(cached: Map<string, string>, tree: TreeEntry[]): SyncPlan {
  const fetch: TreeEntry[] = [];
  const seen = new Set<string>();
  const attachments: Record<string, AttachmentRef> = {};
  for (const e of tree) {
    if (e.type !== 'blob') continue;
    if (isNotePath(e.path)) {
      seen.add(e.path);
      if (cached.get(e.path) !== e.sha) fetch.push(e);
    } else if (imageMime(e.path)) {
      const name = basename(e.path);
      // Prefer files under attachments/ when names collide.
      if (!attachments[name] || e.path.startsWith('attachments/')) attachments[name] = { path: e.path, sha: e.sha };
    }
  }
  const remove = [...cached.keys()].filter((p) => !seen.has(p));
  return { fetch, remove, attachments };
}

export async function fetchNotes(
  gh: GitHubClient,
  entries: TreeEntry[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 8,
): Promise<StoredNote[]> {
  const out: StoredNote[] = [];
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < entries.length) {
      const e = entries[next++];
      const content = await gh.getBlobText(e.sha);
      out.push({ path: e.path, sha: e.sha, content, index: indexNote(e.path, e.sha, content) });
      onProgress?.(++done, entries.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
  return out;
}
