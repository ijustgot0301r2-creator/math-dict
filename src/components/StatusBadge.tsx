import { STATUS_LABEL, type Status } from '../lib/frontmatter';

export default function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}
