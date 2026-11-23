import type { NoteIndexEntry } from './indexer';

export interface TagNode {
  name: string;
  /** Full tag path, e.g. "解析学/実解析". Empty string for the "未分類" bucket. */
  path: string;
  children: TagNode[];
  notes: NoteIndexEntry[];
  /** Distinct notes in this subtree. */
  count: number;
}

export const UNTAGGED = '';

const cmp = (a: string, b: string) => a.localeCompare(b, 'ja');

/** Build the hierarchical tag tree. Notes with several tags appear under each; untagged notes go last. */
export function buildTagTree(entries: NoteIndexEntry[]): TagNode[] {
  const root: TagNode = { name: '', path: '', children: [], notes: [], count: 0 };
  const untagged: NoteIndexEntry[] = [];
  const childMap = new Map<TagNode, Map<string, TagNode>>();
  const child = (parent: TagNode, name: string): TagNode => {
    let m = childMap.get(parent);
    if (!m) childMap.set(parent, (m = new Map()));
    let c = m.get(name);
    if (!c) {
      c = { name, path: parent.path ? `${parent.path}/${name}` : name, children: [], notes: [], count: 0 };
      m.set(name, c);
      parent.children.push(c);
    }
    return c;
  };
  for (const e of entries) {
    const tags = e.tags.map((t) => t.split('/').filter(Boolean)).filter((p) => p.length > 0);
    if (!tags.length) {
      untagged.push(e);
      continue;
    }
    for (const parts of tags) {
      let node = root;
      for (const p of parts) node = child(node, p);
      if (!node.notes.includes(e)) node.notes.push(e);
    }
  }
  const finish = (n: TagNode): Set<string> => {
    n.children.sort((a, b) => cmp(a.name, b.name));
    n.notes.sort((a, b) => cmp(a.title, b.title));
    const s = new Set(n.notes.map((x) => x.path));
    for (const c of n.children) for (const p of finish(c)) s.add(p);
    n.count = s.size;
    return s;
  };
  finish(root);
  const out = root.children;
  if (untagged.length) {
    untagged.sort((a, b) => cmp(a.title, b.title));
    out.push({ name: '未分類', path: UNTAGGED, children: [], notes: untagged, count: untagged.length });
  }
  return out;
}

/** Find a subtree by tag path. */
export function findTag(nodes: TagNode[], path: string): TagNode | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (path.startsWith(n.path + '/')) return findTag(n.children, path);
  }
  return null;
}
