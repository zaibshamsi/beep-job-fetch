import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/** A polite live region that shows one short message on the inverse band for 4 s. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 4000);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const node = (
    <div className="ops-toast-region" role="status" aria-live="polite">
      {msg && <p className="ops-toast">{msg}</p>}
    </div>
  );
  return { show, node };
}

/** A modal confirmation on the native <dialog>: focus is trapped and Esc cancels. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="ops-dialog"
      aria-labelledby="ops-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
    >
      <h2 id="ops-dialog-title" className="ops-dialog__title">
        {title}
      </h2>
      <div className="ops-dialog__body">{children}</div>
      <div className="ops-dialog__actions">
        <button type="button" className="btn btn--secondary" onClick={onCancel} autoFocus>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" onClick={onConfirm} disabled={busy} aria-busy={busy}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
