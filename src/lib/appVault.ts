import * as db from './db';
import type { StoredNote } from './db';
import { bytesToBase64 } from './encoding';
import { nowIso, parseNote, serializeNote, type Frontmatter, type Status } from './frontmatter';
import { GitHubError, type NewTreeEntry } from './github';
import { attachmentName, prepareImage } from './image';
import { indexNote } from './indexer';
import { ATTACHMENTS_DIR, imageMime, normalizeKey, notePath, titleFromPath } from './normalize';
import { rewriteLinks } from './rename';
import { Vault } from './vault';

/** The server copy changed since we loaded it (HTTP 409 / 422, or a SHA mismatch before a rename). */
export class ConflictError extends Error {
  constructor(message = 'サーバー側の内容が更新されています') {
    super(message);
    this.name = 'ConflictError';
  }
}

export interface SaveInput {
  /** Existing note path, or null for a new note. */
  path: string | null;
  title: string;
  fm: Frontmatter;
  body: string;
  /** SHA the edit was based on (null for new notes). */
  baseSha: string | null;
  /** Ignore the base SHA and overwrite whatever is on the server. */
  force?: boolean;
}

export interface RenameInput extends SaveInput {
  path: string;
  oldTitle: string;
  /** rewrite = rewrite [[old]] links in other notes; alias = only add the old title as an alias. */
  mode: 'rewrite' | 'alias';
}

function folderOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i + 1);
}

function wrapConflict(e: unknown): never {
  if (e instanceof GitHubError && e.isConflict) throw new ConflictError();
  throw e;
}

export class AppVault extends Vault {
  private requireOnline(): void {
    if (!this.getSnapshot().online || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      throw new Error('オフラインのため保存できません。下書きは端末に残っています');
    }
  }

  /** Build the file text, stamping created/updated. */
  static compose(fm: Frontmatter, body: string): string {
    const now = nowIso();
    return serializeNote({ ...fm, created: fm.created || now, updated: now }, body);
  }

  /** Is `title` already used by a note other than `selfPath`? */
  titleTaken(title: string, selfPath: string | null): boolean {
    const e = this.getSnapshot().index.byTitle.get(normalizeKey(title));
    return !!e && e.path !== selfPath;
  }

  async saveNote(input: SaveInput): Promise<StoredNote> {
    this.requireOnline();
    const { title, fm, body } = input;
    const path = input.path ?? notePath(title);
    if (!input.path && this.titleTaken(title, null)) throw new Error(`「${title}」という記事はすでにあります`);
    const content = AppVault.compose(fm, body);
    const gh = this.client;
    let sha = input.baseSha ?? undefined;
    if (input.force) sha = (await gh.getFileSha(path)) ?? undefined;
    const res = await gh.putText(path, content, `update: ${title}`, sha).catch(wrapConflict);
    const note: StoredNote = { path, sha: res.sha, content, index: indexNote(path, res.sha, content) };
    await this.storeNote(note);
    return note;
  }

  /** Rename (optionally rewriting links in other notes) as a single commit via the Git Data API. */
  async renameNote(input: RenameInput): Promise<{ title: string; rewritten: number }> {
    this.requireOnline();
    const { path, oldTitle, title: newTitle } = input;
    if (this.titleTaken(newTitle, path)) throw new Error(`「${newTitle}」という記事はすでにあります`);
    await this.sync();
    const snap = this.getSnapshot();
    if (snap.status === 'error') throw new Error(snap.error ?? '同期に失敗しました');
    const current = snap.notes.get(path);
    if (!current) throw new ConflictError('元の記事がサーバー側で削除されています');
    if (!input.force && current.sha !== input.baseSha) throw new ConflictError();
    if (!snap.headSha) throw new Error('リポジトリの状態を取得できませんでした');

    const fm = { ...input.fm, aliases: [...input.fm.aliases] };
    if (input.mode === 'alias' && !fm.aliases.some((a) => normalizeKey(a) === normalizeKey(oldTitle))) {
      fm.aliases.push(oldTitle);
    }
    let content = AppVault.compose(fm, input.body);
    let rewritten = 0;
    const newPath = folderOf(path) + `${newTitle}.md`;
    const entries: NewTreeEntry[] = [];
    if (input.mode === 'rewrite') {
      content = rewriteLinks(content, oldTitle, newTitle).text; // self links
      for (const n of snap.notes.values()) {
        if (n.path === path) continue;
        const r = rewriteLinks(n.content, oldTitle, newTitle);
        if (r.count) {
          rewritten++;
          entries.push({ path: n.path, mode: '100644', type: 'blob', content: r.text });
        }
      }
    }
    entries.push({ path: newPath, mode: '100644', type: 'blob', content });
    if (newPath !== path) entries.push({ path, mode: '100644', type: 'blob', sha: null });
    await this.client
      .commitFiles(snap.headSha, `rename: ${oldTitle} → ${newTitle}`, entries)
      .catch(wrapConflict);
    await this.sync();
    return { title: newTitle, rewritten };
  }

  async deleteNote(path: string, sha: string): Promise<void> {
    this.requireOnline();
    const title = titleFromPath(path);
    await this.client.deleteFile(path, `delete: ${title}`, sha).catch(wrapConflict);
    await this.removeNote(path);
  }

  /** Change only the status (from the note view). */
  async setStatus(path: string, status: Status): Promise<void> {
    const n = this.getSnapshot().notes.get(path);
    if (!n) return;
    const { fm, body } = parseNote(n.content);
    await this.saveNote({ path, title: titleFromPath(path), fm: { ...fm, status }, body, baseSha: n.sha });
  }

  // ---- images ----

  private urls = new Map<string, Promise<string | null>>(); // blob sha -> object URL

  /** Resize/convert and upload to attachments/. Returns the file name to embed as ![[name]]. */
  async uploadImage(file: File): Promise<string> {
    this.requireOnline();
    const { blob, ext } = await prepareImage(file);
    const name = attachmentName(ext);
    const path = `${ATTACHMENTS_DIR}/${name}`;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const res = await this.client.putFile(path, bytesToBase64(bytes), `upload: ${name}`);
    await db.putImage(res.sha, blob);
    await this.addAttachment(name, { path, sha: res.sha });
    return name;
  }

  /**
   * Object URL for an attachment by file name. The repository is private, so the image is fetched with the token
   * via the Blobs API and cached in IndexedDB (keyed by blob SHA, so edits invalidate naturally).
   */
  attachmentUrl(name: string): Promise<string | null> {
    const ref = this.getSnapshot().attachments[name];
    if (!ref) return Promise.resolve(null);
    let p = this.urls.get(ref.sha);
    if (!p) {
      p = (async () => {
        let blob = await db.getImage(ref.sha);
        if (!blob) {
          blob = await this.client.getBlobBinary(ref.sha, imageMime(name) ?? 'application/octet-stream');
          await db.putImage(ref.sha, blob);
        }
        return URL.createObjectURL(blob);
      })().catch(() => {
        this.urls.delete(ref.sha); // allow a retry later (e.g. when back online)
        return null;
      });
      this.urls.set(ref.sha, p);
    }
    return p;
  }

  /** Fetch the server copy of a note, replacing the cached one. Returns null if it no longer exists. */
  async reloadNote(path: string): Promise<StoredNote | null> {
    const f = await this.client.getFileText(path);
    if (!f) {
      await this.removeNote(path);
      return null;
    }
    const note: StoredNote = { path, sha: f.sha, content: f.content, index: indexNote(path, f.sha, f.content) };
    await this.storeNote(note);
    return note;
  }
}

export const vault = new AppVault();
