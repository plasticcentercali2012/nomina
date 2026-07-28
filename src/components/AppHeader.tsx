import { Role } from '../types';

interface Props {
  title: string;
  subtitle: string;
  role?: Role;
  email?: string;
  onSignOut: () => Promise<void>;
}

export function AppHeader({ title, subtitle, role, email, onSignOut }: Props) {
  return (
    <header className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-sky-400">{role === 'admin' ? 'Administrador' : 'Encargado de planta'}</p>
          <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
          <p className="text-slate-400">{subtitle}</p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          {email && <p className="text-sm text-slate-300">Sesión: {email}</p>}
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-400"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  );
}
