import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { formatLocalDate } from '../lib/dateUtils';
import { AppHeader } from '../components/AppHeader';
import { Empleado, Material, Proceso, RegistroDiario } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Icon } from '../components/ui/Icon';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { Toast } from '../components/ui/Toast';

const materiales: Material[] = ['Poli', 'M', 'T'];
const materialDisplayNames: Record<Material, string> = {
  Poli: 'Policolor',
  M: 'Mono',
  T: 'Termo',
};
const procesos: Proceso[] = ['Picador', 'Lavador', 'Aglutinador'];

export function CargaDiariaPage() {
  const { profile, loading, signOut, user } = useAuth();
  const navigate = useNavigate();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [fecha] = useState(formatLocalDate(new Date()));
  const [empleadoId, setEmpleadoId] = useState('');
  const [proceso, setProceso] = useState<Proceso>('Picador');
  const [material, setMaterial] = useState<Material>('Poli');
  const [valor, setValor] = useState('');
  const [registros, setRegistros] = useState<RegistroDiario[]>([]);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    supabase
      .from('empleados')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true })
      .then(({ data }) => {
        if (data) {
          const empleadosData = data as Empleado[];
          setEmpleados(empleadosData);
          const firstId = empleadosData[0]?.id ?? '';
          setEmpleadoId(firstId);
          setProceso(empleadosData[0]?.proceso_habitual ?? 'Picador');
        }
      });
  }, []);

  useEffect(() => {
    if (!empleadoId || !fecha) return;
    const empleado = empleados.find((item) => item.id === empleadoId);
    if (empleado) {
      setProceso(empleado.proceso_habitual);
    }
    supabase
      .from('registros_diarios')
      .select('*')
      .eq('empleado_id', empleadoId)
      .eq('fecha', fecha)
      .then(({ data }) => {
        setRegistros((data as RegistroDiario[]) ?? []);
      });
  }, [empleadoId, fecha, empleados]);

  const totalKilos = useMemo(
    () => registros.reduce((sum, item) => sum + (item.peso_kg ?? 0), 0),
    [registros]
  );

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empleadoId || !valor) return;
    setSaving(true);
    setErrorMessage('');

    const newEntry = {
      empleado_id: empleadoId,
      fecha,
      proceso,
      material,
      peso_kg: Number(valor),
      cantidad_bultos: null,
      creado_por: profile?.id ?? ''
    };

    const { error } = await supabase.from('registros_diarios').insert(newEntry);
    if (!error) {
      setValor('');
      setSuccessMessage('Registro exitoso');
      setTimeout(() => setSuccessMessage(''), 3000);
      const { data } = await supabase
        .from('registros_diarios')
        .select('*')
        .eq('empleado_id', empleadoId)
        .eq('fecha', fecha);
      setRegistros((data as RegistroDiario[]) ?? []);
    } else {
      setErrorMessage('No se pudo registrar. Intenta nuevamente.');
      setTimeout(() => setErrorMessage(''), 4000);
    }

    setSaving(false);
  }

  async function handleSignOut() {
    await signOut?.();
    navigate('/login');
  }

  if (loading) {
    return <LoadingScreen label="Cargando operación diaria" />;
  }

  return (
    <div className="app-bg">
      <AppHeader
        title="Carga diaria"
        subtitle="Registra rápidamente el peso por empleado, proceso y material."
        role={profile?.rol}
        email={user?.email ?? profile?.email}
        onSignOut={handleSignOut}
      />
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <p className="eyebrow">Operación de planta</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">Registro de producción</h2>
          <p className="mt-1 text-sm text-slate-400">Captura el peso procesado de forma rápida y precisa.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card flex items-center gap-5 p-5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-500/10 text-indigo-400"><Icon name="weight" className="h-6 w-6" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Volumen registrado</p>
            <p className="mt-1 text-3xl font-bold text-white">{totalKilos.toLocaleString('es-CO')} <span className="text-sm font-medium text-slate-500">kg</span></p></div>
          </div>

          <div className="card flex items-center gap-5 p-5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-sky-500/10 text-sky-400"><Icon name="calendar" className="h-6 w-6" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Jornada actual</p>
            <p className="mt-1 text-lg font-bold capitalize text-white">{new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${fecha}T12:00:00`))}</p></div>
          </div>
        </div>

        {successMessage && <Toast type="success" message={successMessage} onClose={() => setSuccessMessage('')} />}
        {errorMessage && <Toast type="error" message={errorMessage} onClose={() => setErrorMessage('')} />}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
          <form onSubmit={handleSave} className="card p-5 sm:p-7">
            <div className="mb-6"><h3 className="text-lg font-bold text-white">Nuevo registro</h3><p className="mt-1 text-sm text-slate-500">Todos los campos son obligatorios.</p></div>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Empleado</span>
                <select
                  value={empleadoId}
                  onChange={(event) => setEmpleadoId(event.target.value)}
                  className="field"
                >
                  {empleados.map((empleado) => (
                    <option key={empleado.id} value={empleado.id}>
                      {empleado.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Proceso</span>
                <select value={proceso} disabled className="field">
                  {procesos.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Material</span>
                <select value={material} onChange={(event) => setMaterial(event.target.value as Material)} className="field">
                  {materiales.map((item) => (
                    <option key={item} value={item}>{materialDisplayNames[item]}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Peso / Bultos</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={valor}
                  onChange={(event) => setValor(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleSave(event as any);
                    }
                  }}
                  className="field text-lg font-semibold"
                  placeholder="23, 25, 24"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={saving}
                className="btn-primary mt-1 sm:col-span-2"
              >
                {saving ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Guardando...</> : <><Icon name="plus" className="h-4 w-4" /> Registrar peso</>}
              </button>
            </div>
          </form>

          <aside className="card overflow-hidden">
            <div className="border-b border-slate-800 p-5"><div className="flex items-center justify-between"><h2 className="font-bold text-white">Actividad reciente</h2><span className="badge-success">{registros.length} registros</span></div>
            <p className="mt-1 text-xs text-slate-500">Movimientos del empleado seleccionado.</p></div>
            <div className="max-h-[430px] space-y-2 overflow-y-auto p-3">
              {registros.length === 0 ? (
                <div className="py-12 text-center"><Icon name="file" className="mx-auto h-8 w-8 text-slate-700" /><p className="mt-3 text-sm text-slate-500">Aún no hay registros</p></div>
              ) : (
                registros.map((registro) => (
                  <div key={registro.id} className="flex items-center justify-between rounded-xl border border-transparent bg-slate-950/50 p-3 transition hover:border-slate-800">
                    <div><p className="text-sm font-semibold text-slate-200">{registro.proceso}</p><p className="text-xs text-slate-500">{materialDisplayNames[registro.material]}</p></div>
                    <p className="font-bold text-white">{registro.peso_kg ?? 0} <span className="text-xs font-normal text-slate-500">kg</span></p>
                  </div>
                ))
              )}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
