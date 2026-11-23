import { useMemo } from 'react';
import type { RenderEnv } from './markdown';
import { useVault } from './useVault';

export function useRenderEnv(currentTitle?: string): RenderEnv {
  const { index } = useVault();
  return useMemo(
    () => ({ resolve: (t: string) => index.resolver.resolve(t), currentTitle }),
    [index, currentTitle],
  );
}
