import { useMemo } from 'react';
import { SearchIndex } from './search';
import { useVault } from './useVault';

export function useSearchIndex(): SearchIndex {
  const { notes, index } = useVault();
  return useMemo(
    () =>
      new SearchIndex(
        index.entries.map((e) => ({ title: e.title, aliases: e.aliases, content: notes.get(e.path)?.content ?? '' })),
      ),
    [notes, index],
  );
}
