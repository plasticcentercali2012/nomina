import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

type Props = { open: boolean; title: string; description: string; confirmLabel?: string; variant?: 'danger' | 'primary'; busy?: boolean; onCancel: () => void; onConfirm: () => void };

export function ConfirmDialog({ open, title, description, confirmLabel = 'Eliminar', variant = 'danger', busy = false, onCancel, onConfirm }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const close = (event: KeyboardEvent) => event.key === 'Escape' && !busy && onCancel();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open, busy, onCancel]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={() => !busy && onCancel()}>
    <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" className="w-full max-w-md rounded-3xl border border-slate-700/80 bg-slate-900 p-6 shadow-2xl shadow-black/50" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ${variant === 'danger' ? 'bg-rose-500/10 text-rose-300 ring-rose-500/20' : 'bg-indigo-500/10 text-indigo-300 ring-indigo-500/20'}`}><Icon name={variant === 'danger' ? 'x' : 'check'} className="h-5 w-5" /></span><div><h2 id="confirm-title" className="text-lg font-bold text-white">{title}</h2><p id="confirm-description" className="mt-2 text-sm leading-6 text-slate-400">{description}</p></div></div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button ref={cancelRef} type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>Cancelar</button><button type="button" className={`${variant === 'danger' ? 'btn-danger' : 'btn-primary'} min-w-28 justify-center`} disabled={busy} onClick={onConfirm}>{busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}{busy ? 'Procesando...' : confirmLabel}</button></div>
    </section>
  </div>;
}
