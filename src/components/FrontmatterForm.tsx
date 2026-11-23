import { STATUSES, STATUS_LABEL, type Frontmatter, type Status } from '../lib/frontmatter';
import ChipInput from './ChipInput';

interface Props {
  fm: Frontmatter;
  onChange: (fm: Frontmatter) => void;
  tagSuggestions: string[];
}

const cleanTag = (s: string) =>
  s
    .trim()
    .replace(/^#/, '')
    .replace(/\s+/g, '_')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/|\/$/g, '');

export default function FrontmatterForm({ fm, onChange, tagSuggestions }: Props) {
  return (
    <div className="fm-form">
      <label className="fm-row">
        <span>別名</span>
        <ChipInput value={fm.aliases} onChange={(aliases) => onChange({ ...fm, aliases })} placeholder="Enter で追加" />
      </label>
      <label className="fm-row">
        <span>タグ</span>
        <ChipInput
          value={fm.tags}
          onChange={(tags) => onChange({ ...fm, tags })}
          suggestions={tagSuggestions}
          clean={cleanTag}
          placeholder="例: 解析学/実解析"
        />
      </label>
      <label className="fm-row">
        <span>ステータス</span>
        <select value={fm.status} onChange={(e) => onChange({ ...fm, status: e.target.value as Status })}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="fm-row">
        <span>要約</span>
        <input
          value={fm.summary}
          onChange={(e) => onChange({ ...fm, summary: e.target.value })}
          placeholder="プレビューに表示する一文（省略可）"
        />
      </label>
    </div>
  );
}
