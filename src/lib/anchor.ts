import { normalizeKey } from './normalize';

/** Find the element for `#heading` or `#^block` inside a rendered note. */
export function findAnchor(root: ParentNode, anchor: string): HTMLElement | null {
  const a = anchor.split('#').pop()!.trim(); // nested heading links "A#B": use the last part
  if (a.startsWith('^')) {
    return root.querySelector<HTMLElement>(`[data-block="${CSS.escape(a.slice(1))}"]`);
  }
  const key = normalizeKey(a);
  for (const el of root.querySelectorAll<HTMLElement>('[data-heading]')) {
    if (el.dataset.heading === key) return el;
  }
  return null;
}
