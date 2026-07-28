import { Icon } from './Icon';

export function Toast({ type, message, onClose }: { type: 'success' | 'error'; message: string; onClose?: () => void }) {
  return (
    <div role="status" aria-live="polite" className={`toast ${type === 'success' ? 'toast-success' : 'toast-error'}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-current/10">
        <Icon name={type === 'success' ? 'check' : 'x'} className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-100">{type === 'success' ? 'Operación completada' : 'Algo salió mal'}</p>
        <p className="mt-0.5 text-xs text-slate-400">{message}</p>
      </div>
      {onClose && <button type="button" onClick={onClose} className="ml-2 border-0 bg-transparent p-1 text-slate-500 hover:text-slate-200"><Icon name="x" className="h-4 w-4" /></button>}
    </div>
  );
}
