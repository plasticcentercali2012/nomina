import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Empleado, RegistroDiario, Tarifa, UsuarioSistema } from '../types';

const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;
const procesos = ['Picador', 'Lavador', 'Aglutinador'] as const;
const materiales = ['Poli', 'M', 'T'] as const;

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

export function AdminDashboardPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);
  const [registros, setRegistros] = useState<RegistroDiario[]>([]);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [semanaInicio, setSemanaInicio] = useState('');
  const [nuevoEmpleadoNombre, setNuevoEmpleadoNombre] = useState('');
  const [nuevoEmpleadoProceso, setNuevoEmpleadoProceso] = useState<Empleado['proceso_habitual']>('Picador');
  const [loadingAction, setLoadingAction] = useState(false);

  const weekDates = useMemo(() => {
    if (!semanaInicio) return [];
    const start = new Date(semanaInicio);
    return diasSemana.map((_, index) => {
      const item = new Date(start);
      item.setDate(start.getDate() + index);
      return item.toISOString().slice(0, 10);
    });
  }, [semanaInicio]);

  useEffect(() => {
    const monday = new Date();
    const diff = monday.getDay() === 0 ? -6 : 1 - monday.getDay();
    monday.setDate(monday.getDate() + diff);
    setSemanaInicio(monday.toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    supabase.from<Empleado>('empleados').select('*').order('nombre', { ascending: true }).then(({ data }) => data && setEmpleados(data));
    supabase.from<Tarifa>('tarifas').select('*').order('proceso', { ascending: true }).order('material', { ascending: true }).then(({ data }) => data && setTarifas(data));
    supabase.from<UsuarioSistema>('usuarios_sistema').select('*').order('email', { ascending: true }).then(({ data }) => data && setUsuarios(data));
  }, []);

  useEffect(() => {
    if (!weekDates.length) return;
    supabase
      .from<RegistroDiario>('registros_diarios')
      .select('*')
      .gte('fecha', weekDates[0])
      .lte('fecha', weekDates[weekDates.length - 1])
      .then(({ data }) => data && setRegistros(data));
  }, [weekDates]);

  const estadisticas = useMemo(() => {
    return {
      procesos: registros.reduce<Record<string, number>>((acc, registro) => {
        acc[registro.proceso] = (acc[registro.proceso] ?? 0) + (registro.peso_kg ?? 0);
        return acc;
      }, {}),
      materiales: registros.reduce<Record<string, number>>((acc, registro) => {
        acc[registro.material] = (acc[registro.material] ?? 0) + (registro.peso_kg ?? 0);
        return acc;
      }, {})
    };
  }, [registros]);

  async function handleActualizarTarifa(id: string, precioUnificado: number) {
    setLoadingAction(true);
    const { error } = await supabase.from('tarifas').update({ precio_unidad: precioUnificado }).eq('id', id);
    if (!error) {
      setTarifas((current) => current.map((tarifa) => (tarifa.id === id ? { ...tarifa, precio_unidad: precioUnificado } : tarifa)));
    }
    setLoadingAction(false);
  }

  async function handleCrearEmpleado(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nuevoEmpleadoNombre.trim()) return;

    setLoadingAction(true);
    const { data, error } = await supabase.from('empleados').insert([{ nombre: nuevoEmpleadoNombre.trim(), proceso_habitual: nuevoEmpleadoProceso, activo: true }]);
    if (data?.[0]) {
      setEmpleados((current) => [...current, data[0]]);
      setNuevoEmpleadoNombre('');
      setNuevoEmpleadoProceso('Picador');
    }
    setLoadingAction(false);
  }

  async function handleToggleActivo(empleado: Empleado) {
    const { data, error } = await supabase.from('empleados').update({ activo: !empleado.activo }).eq('id', empleado.id);
    if (!error && data?.[0]) {
      setEmpleados((current) => current.map((item) => (item.id === empleado.id ? { ...item, activo: data[0].activo } : item)));
    }
  }

  function exportSemanalCsv() {
    const headers = ['Empleado', ...weekDates, 'Total kg'];
    const rows = empleados.map((empleado) => {
      const values = weekDates.map((iso) => {
        const total = registros
          .filter((item) => item.empleado_id === empleado.id && item.fecha === iso)
          .reduce((sum, item) => sum + (item.peso_kg ?? 0), 0);
        return total.toFixed(0);
      });
      const total = values.reduce((sum, cell) => sum + Number(cell), 0).toFixed(0);
      return [empleado.nombre, ...values, total];
    });

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nomina_semana_${weekDates[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-sky-400">Administrador</p>
              <h1 className="mt-2 text-3xl font-semibold">Dashboard de nómina</h1>
              <p className="text-slate-400">Visualiza el consolidado semanal, tarifas y la gestión de empleados.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="text-sm text-slate-300">Inicio de semana</label>
              <input
                type="date"
                value={semanaInicio}
                onChange={(event) => setSemanaInicio(event.target.value)}
                className="rounded-2xl bg-slate-950 px-4 py-3"
              />
              <button
                type="button"
                onClick={exportSemanalCsv}
                className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
              >
                Exportar CSV semanal
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
          <h2 className="text-2xl font-semibold">Consolidado semanal</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-300">
                  <th className="px-4 py-3">Empleado</th>
                  {diasSemana.map((dia, index) => (
                    <th key={dia} className="px-4 py-3">{dia} ({weekDates[index]})</th>
                  ))}
                  <th className="px-4 py-3">Total kg</th>
                </tr>
              </thead>
              <tbody>
                {empleados.map((empleado) => {
                  const dias = weekDates.map((iso) =>
                    registros.filter((item) => item.empleado_id === empleado.id && item.fecha === iso).reduce((sum, item) => sum + (item.peso_kg ?? 0), 0)
                  );
                  const total = dias.reduce((sum, valor) => sum + valor, 0);
                  return (
                    <tr key={empleado.id} className="border-b border-slate-800 hover:bg-slate-950/60">
                      <td className="px-4 py-3">{empleado.nombre}</td>
                      {dias.map((valor, index) => (
                        <td key={`${empleado.id}-${index}`} className="px-4 py-3">{valor.toFixed(0)}</td>
                      ))}
                      <td className="px-4 py-3 font-semibold text-sky-300">{total.toFixed(0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <h2 className="text-2xl font-semibold">Tarifas por proceso</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-300">
                    <th className="px-4 py-3">Proceso</th>
                    <th className="px-4 py-3">Material</th>
                    <th className="px-4 py-3">Precio unidad</th>
                    <th className="px-4 py-3">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {tarifas.map((tarifa) => (
                    <tr key={tarifa.id} className="border-b border-slate-800 hover:bg-slate-950/60">
                      <td className="px-4 py-3">{tarifa.proceso}</td>
                      <td className="px-4 py-3">{tarifa.material}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={tarifa.precio_unidad}
                          onChange={(event) => {
                            const precio = Number(event.target.value);
                            setTarifas((current) => current.map((item) => (item.id === tarifa.id ? { ...item, precio_unidad: precio } : item)));
                          }}
                          className="w-24 rounded-2xl bg-slate-950 px-3 py-2 text-slate-100"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleActualizarTarifa(tarifa.id, tarifa.precio_unidad)}
                          disabled={loadingAction}
                          className="rounded-2xl bg-sky-500 px-3 py-2 text-white transition hover:bg-sky-400 disabled:opacity-60"
                        >
                          Guardar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
              <h2 className="text-2xl font-semibold">Gestión de empleados</h2>
              <form onSubmit={handleCrearEmpleado} className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-slate-300">Nombre</span>
                    <input
                      value={nuevoEmpleadoNombre}
                      onChange={(event) => setNuevoEmpleadoNombre(event.target.value)}
                      className="w-full rounded-2xl px-4 py-3"
                      placeholder="Jose, Gloria, Yari"
                      required
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-slate-300">Proceso habitual</span>
                    <select
                      value={nuevoEmpleadoProceso}
                      onChange={(event) => setNuevoEmpleadoProceso(event.target.value as Empleado['proceso_habitual'])}
                      className="w-full rounded-2xl px-4 py-3"
                    >
                      {procesos.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="submit" className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400">
                  Añadir empleado
                </button>
              </form>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
              <h2 className="text-2xl font-semibold">Usuarios del sistema</h2>
              <div className="mt-4 space-y-3">
                {usuarios.map((usuario) => (
                  <div key={usuario.id} className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
                    <p className="font-semibold text-white">{usuario.email}</p>
                    <p className="text-sm text-slate-400">Rol: {usuario.rol}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <h3 className="text-xl font-semibold">Volumen por proceso</h3>
            <div className="mt-4 space-y-3 text-slate-300">
              {procesos.map((proceso) => (
                <div key={proceso} className="flex items-center justify-between rounded-3xl bg-slate-950/70 px-4 py-3">
                  <span>{proceso}</span>
                  <span className="font-semibold text-sky-300">{(estadisticas.procesos[proceso] ?? 0).toFixed(0)} kg</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <h3 className="text-xl font-semibold">Volumen por material</h3>
            <div className="mt-4 space-y-3 text-slate-300">
              {materiales.map((material) => (
                <div key={material} className="flex items-center justify-between rounded-3xl bg-slate-950/70 px-4 py-3">
                  <span>{material}</span>
                  <span className="font-semibold text-sky-300">{(estadisticas.materiales[material] ?? 0).toFixed(0)} kg</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <h3 className="text-xl font-semibold">Resumen rápido</h3>
            <div className="mt-4 space-y-3 text-slate-300">
              <div className="rounded-3xl bg-slate-950/70 px-4 py-3">
                <p>Total empleados</p>
                <p className="text-3xl font-semibold text-sky-300">{empleados.length}</p>
              </div>
              <div className="rounded-3xl bg-slate-950/70 px-4 py-3">
                <p>Total registros</p>
                <p className="text-3xl font-semibold text-sky-300">{registros.length}</p>
              </div>
              <div className="rounded-3xl bg-slate-950/70 px-4 py-3">
                <p>Total kg semana</p>
                <p className="text-3xl font-semibold text-sky-300">{registros.reduce((sum, item) => sum + (item.peso_kg ?? 0), 0).toFixed(0)}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
