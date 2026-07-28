import { Icon } from './Icon';

export function LoadingScreen({ label = 'Preparando tu espacio de trabajo' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-400/20">
          <Icon name="activity" className="h-7 w-7 animate-pulse" />
        </div>
        <p className="mt-5 text-sm font-medium text-slate-300">{label}</p>
        <div className="mx-auto mt-4 h-1 w-40 overflow-hidden rounded-full bg-slate-800">
          <div className="loading-bar h-full rounded-full bg-indigo-500" />
        </div>
      </div>
    </div>
  );
}
