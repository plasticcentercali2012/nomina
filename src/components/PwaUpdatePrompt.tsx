import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, currentRegistration) {
      setRegistration(currentRegistration);
    },
    onRegisterError(error) {
      console.error('No se pudo registrar el actualizador del PWA:', error);
    }
  });

  useEffect(() => {
    if (!registration) return;

    const checkForUpdates = () => {
      if (navigator.onLine) {
        void registration.update().catch((error) => {
          console.error('No se pudo comprobar la actualización del PWA:', error);
        });
      }
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdates();
    };

    checkForUpdates();
    const interval = window.setInterval(checkForUpdates, UPDATE_INTERVAL_MS);
    window.addEventListener('online', checkForUpdates);
    document.addEventListener('visibilitychange', checkWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', checkForUpdates);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, [registration]);

  if (!needRefresh) return null;

  async function installUpdate() {
    setUpdating(true);
    try {
      await updateServiceWorker(true);
    } catch (error) {
      console.error('No se pudo aplicar la actualización del PWA:', error);
      setUpdating(false);
    }
  }

  return (
    <aside role="alert" aria-live="assertive" className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-lg rounded-2xl border border-indigo-400/30 bg-slate-900/95 p-4 shadow-2xl shadow-black/40 backdrop-blur">
      <p className="font-semibold text-white">Hay una nueva versión disponible</p>
      <p className="mt-1 text-sm text-slate-400">
        Actualiza para cargar los últimos cambios. Este aviso permanecerá disponible hasta que actualices.
      </p>
      <button
        type="button"
        className="btn-primary mt-4 w-full"
        disabled={updating}
        onClick={() => void installUpdate()}
      >
        {updating ? 'Actualizando…' : 'Actualizar aplicación'}
      </button>
    </aside>
  );
}
