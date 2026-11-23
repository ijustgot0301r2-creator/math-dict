import { useMemo, useState } from 'react';
import { normalizeKey } from '../lib/normalize';

interface Props {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  /** Normalise an entered value (e.g. strip a leading #). Return '' to reject. */
  clean?: (s: string) => string;
}

export default function ChipInput({ value, onChange, placeholder, suggestions = [], clean = (s) => s.trim() }: Props) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [sel, setSel] = useState(-1);

  const matches = useMemo(() => {
    const q = normalizeKey(text);
    if (!q) return [];
    const taken = new Set(value.map(normalizeKey));
    return suggestions.filter((s) => !taken.has(normalizeKey(s)) && normalizeKey(s).includes(q)).slice(0, 8);
  }, [text, suggestions, value]);

  function add(raw: string) {
    const v = clean(raw);
    setText('');
    setSel(-1);
    if (!v || value.some((x) => normalizeKey(x) === normalizeKey(v))) return;
    onChange([...value, v]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' || e.key === ',' || e.key === '、') {
      if (text.trim()) {
        e.preventDefault();
        add(sel >= 0 && matches[sel] ? matches[sel] : text);
      }
    } else if (e.key === 'Backspace' && text === '' && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === 'ArrowDown' && matches.length) {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp' && matches.length) {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, -1));
    }
  }

  return (
    <div className="chip-input">
      {value.map((v, i) => (
        <span key={v} className="chip-item">
          {v}
          <button type="button" aria-label={`${v} を削除`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            ×
          </button>
        </span>
      ))}
      <input
        value={text}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => {
          const t = e.target.value;
          // Comma typed on mobile keyboards (no keydown key info): split.
          if (/[,、]$/.test(t)) add(t.slice(0, -1));
          else setText(t);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (text.trim()) add(text);
        }}
        autoCapitalize="off"
        autoCorrect="off"
      />
      {focused && matches.length > 0 && (
        <ul className="chip-suggest" onMouseDown={(e) => e.preventDefault()}>
          {matches.map((m, i) => (
            <li key={m} className={i === sel ? 'selected' : ''} onClick={() => add(m)}>
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
