import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AppVault } from './appVault';
import type { VaultSnapshot } from './vault';

export const VaultContext = createContext<AppVault | null>(null);

export function useVaultApi(): AppVault {
  const v = useContext(VaultContext);
  if (!v) throw new Error('VaultContext missing');
  return v;
}

export function useVault(): VaultSnapshot {
  const v = useVaultApi();
  return useSyncExternalStore(v.subscribe, v.getSnapshot);
}
