import { useMemo } from 'react';
import { SearchIndex } from './search';
import { useVault } from './useVault';

/** Returns a getter so the (relatively costly) index is only built when the user actually searches. */
export function useSearchIndex(): () => SearchIndex {
  const { notes, index } = useVault();
  return useMemo(() => {
    let built: SearchIndex | null = null;
    return () =>
      (built ??= new SearchIndex(
        index.entries.map((e) => ({ title: e.title, aliases: e.aliases, content: notes.get(e.path)?.content ?? '' })),
      ));
  }, [notes, index]);
}
