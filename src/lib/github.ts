import type { Settings } from './settings';
import { encodePath, utf8ToBase64 } from './encoding';

/**
 * Minimal GitHub REST client. All URLs are built from the user's settings.
 * Error messages never contain the token (only the HTTP status and GitHub's message).
 */
export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
  get isAuth(): boolean {
    return this.status === 401;
  }
  get isConflict(): boolean {
    return this.status === 409 || this.status === 422;
  }
}

export class NetworkError extends Error {
  constructor() {
    super('ネットワークに接続できません');
    this.name = 'NetworkError';
  }
}

export interface TreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

export interface TreeResult {
  sha: string;
  truncated: boolean;
  tree: TreeEntry[];
}

export interface NewTreeEntry {
  path: string;
  mode: '100644';
  type: 'blob';
  /** Either content (new text) or sha (existing blob) or sha: null (delete). */
  content?: string;
  sha?: string | null;
}

export interface PutResult {
  sha: string; // new blob sha
  commitSha: string;
}

const API = 'https://api.github.com';

/** Listener invoked on 401 so the app can redirect to the settings screen. */
let authErrorListener: (() => void) | null = null;
export function onAuthError(fn: (() => void) | null): void {
  authErrorListener = fn;
}

export class GitHubClient {
  constructor(private s: Settings) {}

  private get repoBase(): string {
    return `${API}/repos/${encodeURIComponent(this.s.owner)}/${encodeURIComponent(this.s.repo)}`;
  }

  private async request(method: string, url: string, body?: unknown, accept = 'application/vnd.github+json'): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        cache: 'no-store',
        headers: {
          Accept: accept,
          Authorization: `Bearer ${this.s.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new NetworkError();
    }
    if (!res.ok) {
      let msg = '';
      try {
        const j = (await res.json()) as { message?: string };
        msg = j.message ?? '';
      } catch {
        /* ignore */
      }
      if (res.status === 401) authErrorListener?.();
      throw new GitHubError(res.status, describeStatus(res.status, msg));
    }
    return res;
  }

  private async json<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await this.request(method, url, body);
    return (await res.json()) as T;
  }

  /** Connection test: repository must be accessible and the branch must exist (or the repo be empty). */
  async testConnection(): Promise<{ empty: boolean }> {
    const repo = await this.json<{ permissions?: { push?: boolean } }>('GET', this.repoBase);
    if (repo.permissions && repo.permissions.push === false) {
      throw new GitHubError(403, 'このトークンには書き込み権限がありません（Contents: Read and write が必要です）');
    }
    const head = await this.getHead();
    return { empty: head === null };
  }

  /** Commit sha of the branch head, or null if the repository is empty. */
  async getHead(): Promise<string | null> {
    try {
      const ref = await this.json<{ object: { sha: string } }>(
        'GET',
        `${this.repoBase}/git/ref/heads/${encodePath(this.s.branch)}`,
      );
      return ref.object.sha;
    } catch (e) {
      // 409: "Git Repository is empty."
      if (e instanceof GitHubError && e.status === 409) return null;
      if (e instanceof GitHubError && e.status === 404) {
        throw new GitHubError(404, `ブランチ「${this.s.branch}」が見つかりません`);
      }
      throw e;
    }
  }

  async getTree(treeish: string): Promise<TreeResult> {
    return this.json<TreeResult>('GET', `${this.repoBase}/git/trees/${encodeURIComponent(treeish)}?recursive=1`);
  }

  async getBlobText(sha: string): Promise<string> {
    const res = await this.request('GET', `${this.repoBase}/git/blobs/${sha}`, undefined, 'application/vnd.github.raw+json');
    return new TextDecoder().decode(await res.arrayBuffer());
  }

  async getBlobBinary(sha: string, mime: string): Promise<Blob> {
    const res = await this.request('GET', `${this.repoBase}/git/blobs/${sha}`, undefined, 'application/vnd.github.raw+json');
    return new Blob([await res.arrayBuffer()], { type: mime });
  }

  /** Current blob sha of a file via the Contents API, or null if missing. */
  async getFileSha(path: string): Promise<string | null> {
    try {
      const j = await this.json<{ sha: string }>(
        'GET',
        `${this.repoBase}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.s.branch)}`,
      );
      return j.sha;
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return null;
      throw e;
    }
  }

  async getFileText(path: string): Promise<{ sha: string; content: string } | null> {
    const sha = await this.getFileSha(path);
    if (!sha) return null;
    return { sha, content: await this.getBlobText(sha) };
  }

  /** Create or update a file. `sha` is required when updating (optimistic concurrency). */
  async putFile(path: string, base64: string, message: string, sha?: string): Promise<PutResult> {
    const j = await this.json<{ content: { sha: string }; commit: { sha: string } }>(
      'PUT',
      `${this.repoBase}/contents/${encodePath(path)}`,
      { message, content: base64, branch: this.s.branch, ...(sha ? { sha } : {}) },
    );
    return { sha: j.content.sha, commitSha: j.commit.sha };
  }

  async putText(path: string, text: string, message: string, sha?: string): Promise<PutResult> {
    return this.putFile(path, utf8ToBase64(text), message, sha);
  }

  async deleteFile(path: string, message: string, sha: string): Promise<void> {
    await this.request('DELETE', `${this.repoBase}/contents/${encodePath(path)}`, {
      message,
      sha,
      branch: this.s.branch,
    });
  }

  // ---- Git Data API (used for multi-file commits such as rename) ----

  async getCommitTree(commitSha: string): Promise<string> {
    const c = await this.json<{ tree: { sha: string } }>('GET', `${this.repoBase}/git/commits/${commitSha}`);
    return c.tree.sha;
  }

  async createTree(baseTree: string, entries: NewTreeEntry[]): Promise<string> {
    const j = await this.json<{ sha: string }>('POST', `${this.repoBase}/git/trees`, { base_tree: baseTree, tree: entries });
    return j.sha;
  }

  async createCommit(message: string, tree: string, parents: string[]): Promise<string> {
    const j = await this.json<{ sha: string }>('POST', `${this.repoBase}/git/commits`, { message, tree, parents });
    return j.sha;
  }

  async updateRef(commitSha: string): Promise<void> {
    await this.request('PATCH', `${this.repoBase}/git/refs/heads/${encodePath(this.s.branch)}`, {
      sha: commitSha,
      force: false,
    });
  }

  /** Commit several file changes at once on top of `headSha`. Fails (422) if the branch moved. */
  async commitFiles(headSha: string, message: string, entries: NewTreeEntry[]): Promise<string> {
    const baseTree = await this.getCommitTree(headSha);
    const tree = await this.createTree(baseTree, entries);
    const commit = await this.createCommit(message, tree, [headSha]);
    await this.updateRef(commit);
    return commit;
  }
}

function describeStatus(status: number, msg: string): string {
  switch (status) {
    case 401:
      return 'トークンが無効か、有効期限が切れています';
    case 403:
      return msg.includes('rate limit') ? 'API の利用回数の上限に達しました。しばらく待ってください' : `アクセスが拒否されました（${msg || '403'}）`;
    case 404:
      return 'リポジトリまたはファイルが見つかりません（owner / repo / 権限を確認してください）';
    case 409:
    case 422:
      return `サーバー側の内容と競合しました（${msg || status}）`;
    default:
      return `GitHub API エラー ${status}${msg ? `: ${msg}` : ''}`;
  }
}
