import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { AppHeader } from '../components/AppHeader';
import { Empleado, Material, Proceso, RegistroDiario } from '../types';
import { useAuth } from '../hooks/useAuth';

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
  const [fecha] = useState(new Date().toISOString().slice(0, 10));
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
    return <div className="p-8 text-center text-slate-300">Cargando...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
      <AppHeader
        title="Carga diaria"
        subtitle="Registra rápidamente el peso por empleado, proceso y material."
        role={profile?.rol}
        email={user?.email ?? profile?.email}
        onSignOut={handleSignOut}
      />
      <div className="mx-auto w-full max-w-5xl space-y-12">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Resumen diario</p>
            <p className="mt-4 text-5xl font-semibold text-sky-400">{totalKilos.toFixed(0)}</p>
            <p className="mt-2 text-sm text-slate-400">kg registrados hoy</p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Fecha de hoy</p>
            <p className="mt-4 text-3xl font-semibold text-white">{fecha}</p>
            <p className="mt-2 text-sm text-slate-500">Fecha fija, no editable</p>
          </div>
        </div>

        {successMessage && (
          <div className="rounded-3xl border border-emerald-500 bg-emerald-500/10 p-4 text-emerald-200">
            {successMessage}
          </div>
        )}
        {errorMessage && (
          <div className="rounded-3xl border border-rose-500 bg-rose-500/10 p-4 text-rose-200">
            {errorMessage}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <form onSubmit={handleSave} className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <div className="grid gap-4">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Empleado</span>
                <select
                  value={empleadoId}
                  onChange={(event) => setEmpleadoId(event.target.value)}
                  className="w-full rounded-2xl bg-slate-950 px-4 py-3"
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
                <select value={proceso} disabled className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-slate-400">
                  {procesos.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Material</span>
                <select value={material} onChange={(event) => setMaterial(event.target.value as Material)} className="w-full rounded-2xl bg-slate-950 px-4 py-3">
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
                  className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-xl font-semibold"
                  placeholder="23, 25, 24"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={saving}
                className="mt-2 w-full rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Guardando...' : 'Registrar peso'}
              </button>
            </div>
          </form>

          <aside className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <h2 className="text-xl font-semibold">Registros de hoy</h2>
            <p className="mt-2 text-sm text-slate-400">Detalle de lo ingresado para este empleado.</p>
            <div className="mt-6 space-y-3">
              {registros.length === 0 ? (
                <p className="text-sm text-slate-500">Aún no hay registros para este empleado.</p>
              ) : (
                registros.map((registro) => (
                  <div key={registro.id} className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
                    <p className="font-semibold text-white">{registro.proceso} - {materialDisplayNames[registro.material]}</p>
                    <p className="text-sm text-slate-400">{registro.peso_kg ?? 0} kg</p>
                  </div>
                ))
              )}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
