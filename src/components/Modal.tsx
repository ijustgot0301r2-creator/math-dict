import type { ReactNode } from 'react';

export interface ModalAction {
  label: string;
  onClick: () => void;
  kind?: 'primary' | 'danger';
  disabled?: boolean;
}

interface Props {
  title: string;
  children?: ReactNode;
  actions: ModalAction[];
  onClose?: () => void;
}

export default function Modal({ title, children, actions, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children && <div className="modal-body">{children}</div>}
        <div className="modal-actions">
          {actions.map((a) => (
            <button key={a.label} className={a.kind ?? ''} onClick={a.onClick} disabled={a.disabled}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
