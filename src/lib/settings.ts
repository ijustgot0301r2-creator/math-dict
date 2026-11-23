export interface Settings {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

const KEY = 'math-dict:settings';

export const DEFAULT_SETTINGS: Settings = { owner: '', repo: 'math-notes', branch: 'main', token: '' };

export function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Settings>;
    if (!s.owner || !s.repo || !s.branch || !s.token) return null;
    return { owner: s.owner, repo: s.repo, branch: s.branch, token: s.token };
  } catch {
    return null;
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function loadSettingsDraft(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}
