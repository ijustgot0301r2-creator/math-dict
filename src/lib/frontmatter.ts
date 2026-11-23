/**
 * Minimal YAML frontmatter reader/writer for the keys this app uses.
 * Unknown keys are preserved verbatim so Obsidian-side additions survive a save.
 */

export type Status = 'draft' | 'review' | 'understood';
export const STATUSES: Status[] = ['draft', 'review', 'understood'];
export const STATUS_LABEL: Record<Status, string> = {
  draft: '書きかけ',
  review: '要確認',
  understood: '理解済み',
};

export interface Frontmatter {
  aliases: string[];
  tags: string[];
  status: Status;
  summary: string;
  created: string;
  updated: string;
  /** Raw YAML lines of keys this app does not manage (kept as-is). */
  extra: string[];
}

export interface ParsedNote {
  fm: Frontmatter;
  body: string;
  /** Number of lines before the body (frontmatter block incl. delimiters). */
  bodyLineOffset: number;
}

const KNOWN = new Set(['aliases', 'alias', 'tags', 'tag', 'status', 'summary', 'created', 'updated']);

export function emptyFrontmatter(): Frontmatter {
  return { aliases: [], tags: [], status: 'draft', summary: '', created: '', updated: '', extra: [] };
}

export function splitFrontmatter(text: string): { yaml: string | null; body: string; bodyLineOffset: number } {
  const src = text.replace(/^\uFEFF/, '');
  const m = src.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
  if (!m) {
    // Empty frontmatter: "---\n---"
    const e = src.match(/^---[ \t]*\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
    if (e) return { yaml: '', body: src.slice(e[0].length), bodyLineOffset: 2 };
    return { yaml: null, body: src, bodyLineOffset: 0 };
  }
  const lines = m[0].split('\n').length - (m[0].endsWith('\n') ? 1 : 0);
  return { yaml: m[1], body: src.slice(m[0].length), bodyLineOffset: lines };
}

export function parseNote(text: string): ParsedNote {
  const { yaml, body, bodyLineOffset } = splitFrontmatter(text);
  const fm = emptyFrontmatter();
  if (yaml) parseYaml(yaml, fm);
  return { fm, body, bodyLineOffset };
}

function parseYaml(yaml: string, fm: Frontmatter): void {
  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const km = line.match(/^([A-Za-z_][\w-]*)\s*:(.*)$/);
    if (!km) {
      i++;
      continue;
    }
    const key = km[1];
    let rest = km[2].trim();
    // Collect continuation lines (indented or list items).
    const start = i;
    i++;
    const cont: string[] = [];
    while (i < lines.length && (/^\s+\S/.test(lines[i]) || /^-\s/.test(lines[i]) || lines[i].trim() === '')) {
      if (lines[i].trim() === '' && !(i + 1 < lines.length && /^\s/.test(lines[i + 1]))) break;
      cont.push(lines[i]);
      i++;
    }
    if (!KNOWN.has(key)) {
      fm.extra.push(...lines.slice(start, i));
      continue;
    }
    let value: string | string[];
    if (rest === '' && cont.some((l) => /^\s*-\s*/.test(l))) {
      value = cont.filter((l) => /^\s*-/.test(l)).map((l) => unquote(stripComment(l.replace(/^\s*-\s*/, ''))));
    } else if (/^[|>][+-]?$/.test(rest)) {
      const folded = rest.startsWith('>');
      const indent = Math.min(...cont.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length));
      const parts = cont.map((l) => l.slice(indent));
      value = (folded ? parts.join(' ') : parts.join('\n')).trim();
    } else {
      rest = [rest, ...cont.map((l) => l.trim())].join(' ').trim();
      if (rest.startsWith('[')) value = parseFlowList(rest);
      else value = unquote(stripComment(rest));
    }
    assign(fm, key, value);
  }
}

function assign(fm: Frontmatter, key: string, value: string | string[]): void {
  const list = (v: string | string[]) =>
    (Array.isArray(v) ? v : v.split(/,\s*/)).map((s) => s.trim()).filter(Boolean);
  switch (key) {
    case 'aliases':
    case 'alias':
      fm.aliases.push(...list(value));
      break;
    case 'tags':
    case 'tag':
      fm.tags.push(
        ...(Array.isArray(value) ? value : value.split(/[,\s]+/))
          .map((t) => t.trim().replace(/^#/, ''))
          .filter(Boolean),
      );
      break;
    case 'status': {
      const s = String(value).trim() as Status;
      fm.status = STATUSES.includes(s) ? s : 'draft';
      break;
    }
    case 'summary':
      fm.summary = Array.isArray(value) ? value.join(' ') : value;
      break;
    case 'created':
    case 'updated':
      fm[key] = Array.isArray(value) ? '' : value;
      break;
  }
}

function stripComment(s: string): string {
  if (/^["']/.test(s.trim())) return s.trim();
  const m = s.match(/(^|\s)#/);
  return (m ? s.slice(0, m.index) : s).trim();
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t) as string;
    } catch {
      return t.slice(1, -1);
    }
  }
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

/** Parse `[a, "b, c", 'd']`. */
function parseFlowList(s: string): string[] {
  const inner = stripTrailingComment(s).replace(/^\[/, '').replace(/\]$/, '');
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (q) {
      cur += c;
      if (c === '\\' && q === '"' && i + 1 < inner.length) cur += inner[++i];
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      q = c;
      cur += c;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => unquote(x)).filter((x) => x !== '');
}

function stripTrailingComment(s: string): string {
  const end = s.lastIndexOf(']');
  return end >= 0 ? s.slice(0, end + 1) : s;
}

// ---------- writing ----------

function needsQuote(s: string): boolean {
  return (
    s === '' ||
    /^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
    /[:,[\]{}]\s|[,[\]{}]|\s#|:$/.test(s) ||
    /\s$/.test(s) ||
    /^(true|false|yes|no|null|on|off|~)$/i.test(s) ||
    /^[-+]?(\d|\.\d)/.test(s) ||
    /[\n\r\t"\\]/.test(s)
  );
}

export function yamlScalar(s: string): string {
  return needsQuote(s) ? JSON.stringify(s) : s;
}

function yamlList(xs: string[]): string {
  return `[${xs.map(yamlScalar).join(', ')}]`;
}

export function serializeFrontmatter(fm: Frontmatter): string {
  const lines: string[] = [];
  if (fm.aliases.length) lines.push(`aliases: ${yamlList(fm.aliases)}`);
  if (fm.tags.length) lines.push(`tags: ${yamlList(fm.tags)}`);
  lines.push(`status: ${fm.status}`);
  if (fm.summary.trim()) lines.push(`summary: ${yamlScalar(fm.summary.trim().replace(/\s*\n\s*/g, ' '))}`);
  if (fm.created) lines.push(`created: ${fm.created}`);
  if (fm.updated) lines.push(`updated: ${fm.updated}`);
  lines.push(...fm.extra);
  return `---\n${lines.join('\n')}\n---\n`;
}

export function serializeNote(fm: Frontmatter, body: string): string {
  return serializeFrontmatter(fm) + body.replace(/^\n+/, '');
}

/** ISO 8601 with the local UTC offset, e.g. 2026-11-23T15:30:00+09:00 */
export function nowIso(d = new Date()): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
  );
}
