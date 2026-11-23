import * as db from './db';
import type { AttachmentRef, StoredNote, VaultState } from './db';
import { GitHubClient, GitHubError, NetworkError } from './github';
import { buildIndex, type VaultIndex } from './indexer';
import { normalizeKey } from './normalize';
import { loadSettings, type Settings } from './settings';
import { fetchNotes, planSync } from './sync';

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'offline' | 'error';

export interface VaultSnapshot {
  loaded: boolean;
  status: SyncStatus;
  error: string | null;
  progress: { done: number; total: number } | null;
  online: boolean;
  notes: Map<string, StoredNote>; // path -> note
  index: VaultIndex;
  attachments: Record<string, AttachmentRef>;
  headSha: string | null;
}

type Listener = () => void;

function sourceKey(s: Settings): string {
  return `${s.owner}/${s.repo}@${s.branch}`;
}

export class Vault {
  private snap: VaultSnapshot = {
    loaded: false,
    status: 'idle',
    error: null,
    progress: null,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    notes: new Map(),
    index: buildIndex([]),
    attachments: {},
    headSha: null,
  };
  private listeners = new Set<Listener>();
  private syncing: Promise<void> | null = null;
  private settings: Settings | null = null;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): VaultSnapshot => this.snap;

  protected set(patch: Partial<VaultSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  get client(): GitHubClient {
    const s = this.settings ?? loadSettings();
    if (!s) throw new Error('設定が未入力です');
    return new GitHubClient(s);
  }

  /** Load the IndexedDB cache, then start a sync. */
  async init(): Promise<void> {
    this.settings = loadSettings();
    if (!this.settings) return;
    const { notes, state } = await db.loadAll();
    if (state && state.source !== sourceKey(this.settings)) {
      await db.clearVault();
      this.commitNotes(new Map(), {}, null, true);
    } else {
      this.commitNotes(new Map(notes.map((n) => [n.path, n])), state?.attachments ?? {}, state?.headSha ?? null, true);
    }
    void this.sync();
  }

  /** Called after the settings screen saved new values. */
  async reconfigure(): Promise<void> {
    this.settings = loadSettings();
    this.set({ loaded: false });
    await this.init();
  }

  setOnline(online: boolean): void {
    this.set({ online, ...(online ? {} : { status: 'offline' as const }) });
    if (online) void this.sync();
  }

  private commitNotes(
    notes: Map<string, StoredNote>,
    attachments: Record<string, AttachmentRef>,
    headSha: string | null,
    loaded = this.snap.loaded,
  ): void {
    this.set({ notes, attachments, headSha, loaded, index: buildIndex([...notes.values()].map((n) => n.index)) });
  }

  sync(): Promise<void> {
    if (!this.syncing) {
      this.syncing = this.doSync().finally(() => {
        this.syncing = null;
      });
    }
    return this.syncing;
  }

  private async doSync(): Promise<void> {
    if (!this.settings) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.set({ status: 'offline', online: false });
      return;
    }
    this.set({ status: 'syncing', error: null, progress: null });
    try {
      const gh = this.client;
      const head = await gh.getHead();
      const tree = head ? (await gh.getTree(head)).tree : [];
      const cached = new Map([...this.snap.notes.values()].map((n) => [n.path, n.sha]));
      const plan = planSync(cached, tree);
      const fetched = await fetchNotes(gh, plan.fetch, (done, total) => this.set({ progress: { done, total } }));
      const state: VaultState = {
        source: sourceKey(this.settings),
        headSha: head,
        attachments: plan.attachments,
        syncedAt: Date.now(),
      };
      await db.applyChanges(fetched, plan.remove, state);
      const notes = new Map(this.snap.notes);
      for (const p of plan.remove) notes.delete(p);
      for (const n of fetched) notes.set(n.path, n);
      this.commitNotes(notes, plan.attachments, head);
      this.set({ status: 'ok', progress: null, online: true });
    } catch (e) {
      if (e instanceof NetworkError) this.set({ status: 'offline', progress: null, error: null });
      else this.set({ status: 'error', progress: null, error: errorMessage(e) });
    }
  }

  // ---- queries ----

  noteByTitle(title: string): StoredNote | undefined {
    const e = this.snap.index.byTitle.get(normalizeKey(title));
    return e ? this.snap.notes.get(e.path) : undefined;
  }

  /** Update one note in memory + IndexedDB after a successful write. */
  protected async storeNote(n: StoredNote, removePath?: string): Promise<void> {
    const notes = new Map(this.snap.notes);
    if (removePath) notes.delete(removePath);
    notes.set(n.path, n);
    await db.applyChanges([n], removePath ? [removePath] : [], this.state());
    this.commitNotes(notes, this.snap.attachments, this.snap.headSha);
  }

  protected state(): VaultState {
    return {
      source: this.settings ? sourceKey(this.settings) : '',
      headSha: this.snap.headSha,
      attachments: this.snap.attachments,
      syncedAt: Date.now(),
    };
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof GitHubError || e instanceof NetworkError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
