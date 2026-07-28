import { ReactNode } from 'react';

interface Props {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthLayout({ title, description, children }: Props) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(79,70,229,.2),transparent_25rem),radial-gradient(circle_at_85%_80%,rgba(14,165,233,.12),transparent_25rem)]" />
      <div className="relative w-full max-w-md rounded-3xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-9">
        <div className="mb-8">
          <div className="mb-7 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-500 font-bold text-white shadow-lg shadow-indigo-950/40">PC</div>
            <div><p className="font-bold text-white">Plastic Center</p><p className="text-xs text-slate-500">Gestión de nómina</p></div>
          </div>
          <p className="eyebrow">Acceso seguro</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
