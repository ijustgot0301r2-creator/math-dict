import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubClient, GitHubError } from './github';
import { base64ToUtf8, encodePath, utf8ToBase64 } from './encoding';

const settings = { owner: 'me', repo: 'math-notes', branch: 'main', token: 'github_pat_SECRET' };

afterEach(() => vi.unstubAllGlobals());

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('encoding', () => {
  it('round-trips UTF-8 through base64', () => {
    const s = '位相空間 $x^2$ 😀';
    expect(base64ToUtf8(utf8ToBase64(s))).toBe(s);
  });
  it('encodes path segments but keeps slashes', () => {
    expect(encodePath('notes/位相 空間.md')).toBe('notes/%E4%BD%8D%E7%9B%B8%20%E7%A9%BA%E9%96%93.md');
  });
});

describe('GitHubClient', () => {
  it('builds URLs from settings', async () => {
    const fn = mockFetch(200, { content: { sha: 'abc' }, commit: { sha: 'c1' } });
    const r = await new GitHubClient(settings).putText('notes/コンパクト.md', 'x', 'update: コンパクト', 'old');
    expect(r.sha).toBe('abc');
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.github.com/repos/me/math-notes/contents/notes/${encodeURIComponent('コンパクト')}.md`);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ message: 'update: コンパクト', branch: 'main', sha: 'old' });
  });

  it('never puts the token into error messages', async () => {
    mockFetch(401, { message: 'Bad credentials' });
    const err = await new GitHubClient(settings).getTree('main').catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.isAuth).toBe(true);
    expect(String(err.message)).not.toContain('SECRET');
  });

  it('treats 409 and 422 as conflicts', () => {
    expect(new GitHubError(409, '').isConflict).toBe(true);
    expect(new GitHubError(422, '').isConflict).toBe(true);
    expect(new GitHubError(404, '').isConflict).toBe(false);
  });

  it('returns null head for an empty repository', async () => {
    mockFetch(409, { message: 'Git Repository is empty.' });
    expect(await new GitHubClient(settings).getHead()).toBeNull();
  });
});
