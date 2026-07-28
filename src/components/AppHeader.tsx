import { Role } from '../types';
import { Icon } from './ui/Icon';

interface Props { title: string; subtitle: string; role?: Role; email?: string; onSignOut: () => Promise<void>; }

export function AppHeader({ title, subtitle, role, email, onSignOut }: Props) {
  const initials = (email?.slice(0, 2) || 'PC').toUpperCase();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-950/50">
            <Icon name="sparkles" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-bold text-white sm:text-base">{title}</h1>
              <span className="hidden rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-400 sm:inline">PWA</span>
            </div>
            <p className="hidden truncate text-xs text-slate-500 sm:block">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-right md:block">
            <span className="block text-xs font-semibold text-slate-200">{email}</span>
            <span className="block text-[10px] capitalize text-slate-500">
              {role === 'admin' ? 'Administrador' : role === 'gerencial' ? 'Gerencial' : 'Encargado de planta'}
            </span>
          </span>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-xs font-bold text-indigo-300 ring-1 ring-slate-700">{initials}</div>
          <button type="button" onClick={() => void onSignOut()} title="Cerrar sesión" aria-label="Cerrar sesión"
            className="grid h-9 w-9 place-items-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 transition hover:border-rose-500/30 hover:text-rose-400">
            <Icon name="logout" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
