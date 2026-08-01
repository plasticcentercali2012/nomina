import { useEffect, useState } from 'react';
import { getQzPrinters, getSavedPrinter, saveQzPrinter } from '../../lib/qzPrinter';
import { Icon } from './Icon';

type Props = { open: boolean; onClose: () => void; onSelected: (printer: string) => void };

export function PrinterDialog({ open, onClose, onSelected }: Props) {
  const [printers, setPrinters] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try { const data = await getQzPrinters(); setPrinters(data.printers); const saved = getSavedPrinter(); setSelected(saved && data.printers.includes(saved) ? saved : data.defaultPrinter); }
    catch (reason) { setPrinters([]); setError(reason instanceof Error ? reason.message : 'No se pudieron consultar las impresoras.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (open) void load(); }, [open]);
  useEffect(() => { if (!open) return; const close = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [open, onClose]);
  if (!open) return null;
  const confirm = () => { if (selected) { saveQzPrinter(selected); onSelected(selected); onClose(); } };
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="printer-title" className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/50" onMouseDown={(e) => e.stopPropagation()}>
      <header className="flex items-start justify-between gap-4 border-b border-slate-800 p-5 sm:p-6"><div className="flex gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20"><Icon name="printer" className="h-5 w-5" /></span><div><h2 id="printer-title" className="text-lg font-bold text-white">Seleccionar impresora</h2><p className="mt-1 text-sm text-slate-400">Dispositivos detectados por QZ Tray</p></div></div><button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-xl border-0 bg-transparent p-2 text-slate-500 hover:bg-slate-800 hover:text-white"><Icon name="x" className="h-5 w-5" /></button></header>
      <div className="min-h-40 overflow-y-auto p-5 sm:p-6">{loading ? <div className="grid place-items-center gap-3 py-8 text-sm text-slate-400"><span className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-400/25 border-t-indigo-400" />Buscando impresoras...</div> : error ? <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4"><p className="font-semibold text-rose-200">No fue posible conectar</p><p className="mt-1 text-sm leading-5 text-rose-200/70">{error}</p></div> : <div role="radiogroup" aria-label="Impresoras disponibles" className="space-y-2">{printers.map((printer) => <label key={printer} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${selected === printer ? 'border-indigo-400/60 bg-indigo-500/10 ring-1 ring-indigo-500/20' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'}`}><input type="radio" name="qz-printer" checked={selected === printer} onChange={() => setSelected(printer)} /><Icon name="printer" className="h-5 w-5 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">{printer}</span>{selected === printer && <span className="badge-success">Seleccionada</span>}</label>)}</div>}</div>
      <footer className="flex flex-col-reverse gap-3 border-t border-slate-800 p-5 sm:flex-row sm:justify-between sm:p-6"><button type="button" className="btn-secondary" disabled={loading} onClick={() => void load()}><Icon name="activity" className="h-4 w-4" />Buscar de nuevo</button><div className="flex flex-col-reverse gap-3 sm:flex-row"><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button type="button" className="btn-primary" disabled={!selected || loading} onClick={confirm}><Icon name="check" className="h-4 w-4" />Usar impresora</button></div></footer>
    </section>
  </div>;
}
