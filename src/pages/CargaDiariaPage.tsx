import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Empleado, Material, Proceso, RegistroDiario } from '../types';
import { useAuth } from '../hooks/useAuth';

const materiales: Material[] = ['Poli', 'M', 'T'];
const procesos: Proceso[] = ['Picador', 'Lavador', 'Aglutinador'];

export function CargaDiariaPage() {
  const { profile, loading } = useAuth();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [empleadoId, setEmpleadoId] = useState('');
  const [proceso, setProceso] = useState<Proceso>('Picador');
  const [material, setMaterial] = useState<Material>('Poli');
  const [valor, setValor] = useState('');
  const [registros, setRegistros] = useState<RegistroDiario[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from<Empleado>('empleados')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setEmpleados(data);
          setEmpleadoId(data[0]?.id ?? '');
        }
      });
  }, []);

  useEffect(() => {
    if (!empleadoId || !fecha) return;
    supabase
      .from<RegistroDiario>('registros_diarios')
      .select('*')
      .eq('empleado_id', empleadoId)
      .eq('fecha', fecha)
      .then(({ data }) => {
        setRegistros(data ?? []);
      });
  }, [empleadoId, fecha]);

  const totalKilos = useMemo(
    () => registros.reduce((sum, item) => sum + (item.peso_kg ?? 0), 0),
    [registros]
  );

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empleadoId || !valor) return;
    setSaving(true);

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
      const { data } = await supabase
        .from<RegistroDiario>('registros_diarios')
        .select('*')
        .eq('empleado_id', empleadoId)
        .eq('fecha', fecha);
      setRegistros(data ?? []);
    }

    setSaving(false);
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-300">Cargando...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-sky-400">Encargado de Planta</p>
              <h1 className="mt-2 text-3xl font-semibold">Carga diaria</h1>
              <p className="text-slate-400">Registra los pesajes por empleado rápidamente.</p>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <form onSubmit={handleSave} className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Fecha</span>
                <input
                  type="date"
                  value={fecha}
                  onChange={(event) => setFecha(event.target.value)}
                  className="w-full rounded-2xl px-4 py-3"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Empleado</span>
                <select
                  value={empleadoId}
                  onChange={(event) => setEmpleadoId(event.target.value)}
                  className="w-full rounded-2xl px-4 py-3"
                >
                  {empleados.map((empleado) => (
                    <option key={empleado.id} value={empleado.id}>
                      {empleado.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Proceso</span>
                <select value={proceso} onChange={(event) => setProceso(event.target.value as Proceso)} className="w-full rounded-2xl px-4 py-3">
                  {procesos.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Material</span>
                <select value={material} onChange={(event) => setMaterial(event.target.value as Material)} className="w-full rounded-2xl px-4 py-3">
                  {materiales.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-4 space-y-2">
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
                className="w-full rounded-2xl px-4 py-3 text-xl font-semibold"
                placeholder="23, 25, 24"
                required
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="mt-6 w-full rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Registrar peso'}
            </button>
          </form>

          <aside className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <h2 className="text-xl font-semibold">Resumen diario</h2>
            <p className="mt-2 text-sm text-slate-400">Total kilos registrados hoy</p>
            <div className="mt-6 rounded-3xl bg-slate-950/80 p-5 text-center">
              <p className="text-5xl font-semibold text-sky-400">{totalKilos.toFixed(0)}</p>
              <p className="mt-1 text-slate-400">kg</p>
            </div>

            <div className="mt-6 space-y-3">
              {registros.map((registro) => (
                <div key={registro.id} className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
                  <p className="font-semibold text-white">{registro.proceso} - {registro.material}</p>
                  <p className="text-sm text-slate-400">{registro.peso_kg ?? 0} kg</p>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
