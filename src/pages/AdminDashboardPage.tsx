import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { AppHeader } from '../components/AppHeader';
import { Empleado, NominaSemanal, PagoAdicional, RegistroDiario, Tarifa, UsuarioSistema } from '../types';
import { useAuth } from '../hooks/useAuth';

const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;
const procesos = ['Picador', 'Lavador', 'Aglutinador'] as const;
const materiales = ['Poli', 'M', 'T'] as const;
const materialDisplayNames: Record<typeof materiales[number], string> = {
  Poli: 'Policolor',
  M: 'Mono',
  T: 'Termo',
};

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

export function AdminDashboardPage() {
  const { profile, loading, signOut, user } = useAuth();
  const navigate = useNavigate();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);
  const [registros, setRegistros] = useState<RegistroDiario[]>([]);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [pagosAdicionales, setPagosAdicionales] = useState<PagoAdicional[]>([]);
  const [nominasSemanales, setNominasSemanales] = useState<NominaSemanal[]>([]);
  const [semanaInicio, setSemanaInicio] = useState('');
  const [registroEditValues, setRegistroEditValues] = useState<Record<string, string>>({});
  const [nuevoEmpleadoNombre, setNuevoEmpleadoNombre] = useState('');
  const [nuevoEmpleadoProceso, setNuevoEmpleadoProceso] = useState<Empleado['proceso_habitual']>('Picador');
  const [nuevoTarifaProceso, setNuevoTarifaProceso] = useState<Tarifa['proceso']>('Picador');
  const [nuevoTarifaMaterial, setNuevoTarifaMaterial] = useState<Tarifa['material']>('Poli');
  const [nuevoTarifaPrecio, setNuevoTarifaPrecio] = useState<number>(0);
  const [nuevoPagoDescripcion, setNuevoPagoDescripcion] = useState('');
  const [nuevoPagoValor, setNuevoPagoValor] = useState<number>(0);
  const [pagoEmpleadoId, setPagoEmpleadoId] = useState<string>('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [activeTab, setActiveTab] = useState<'gestion' | 'tarifas' | 'consolidado'>('gestion');

  const weekDates = useMemo(() => {
    if (!semanaInicio) return [];
    const start = new Date(semanaInicio);
    return diasSemana.map((_, index) => {
      const item = new Date(start);
      item.setDate(start.getDate() + index);
      return item.toISOString().slice(0, 10);
    });
  }, [semanaInicio]);

  const isAdmin = profile?.rol === 'admin';

  async function handleSignOut() {
    await signOut?.();
    navigate('/login');
  }

  useEffect(() => {
    const monday = new Date();
    const diff = monday.getDay() === 0 ? -6 : 1 - monday.getDay();
    monday.setDate(monday.getDate() + diff);
    setSemanaInicio(monday.toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    supabase.from('empleados').select('*').order('nombre', { ascending: true }).then(({ data }) => data && setEmpleados(data as Empleado[]));
    supabase.from('tarifas').select('*').order('proceso', { ascending: true }).order('material', { ascending: true }).then(({ data }) => data && setTarifas(data as Tarifa[]));
    supabase.from('usuarios_sistema').select('*').order('email', { ascending: true }).then(({ data }) => data && setUsuarios(data as UsuarioSistema[]));
  }, []);

  useEffect(() => {
    if (!weekDates.length) return;

    supabase
      .from('registros_diarios')
      .select('*')
      .gte('fecha', weekDates[0])
      .lte('fecha', weekDates[weekDates.length - 1])
      .then(({ data }) => {
        if (data) {
          const registrosData = data as RegistroDiario[];
          setRegistros(registrosData);
          setRegistroEditValues(Object.fromEntries(registrosData.map((item) => [item.id, item.peso_kg?.toString() ?? ''])));
        }
      });

    supabase
      .from('pagos_adicionales')
      .select('*')
      .eq('semana_inicio', weekDates[0])
      .then(({ data }) => data && setPagosAdicionales(data as PagoAdicional[]));

    supabase
      .from('nominas_semanales')
      .select('*')
      .eq('semana_inicio', weekDates[0])
      .then(({ data }) => data && setNominasSemanales(data as NominaSemanal[]));
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

  function getDetallesDelDia(empleadoId: string, fecha: string) {
    return registros
      .filter((item) => item.empleado_id === empleadoId && item.fecha === fecha)
      .map((item) => `${item.proceso} ${materialDisplayNames[item.material]} ${item.peso_kg?.toFixed(0) ?? 0} kg`);
  }

  async function handleActualizarTarifa(id: string, precioUnificado: number) {
    setLoadingAction(true);
    const { error } = await supabase.from('tarifas').update({ precio_unidad: precioUnificado }).eq('id', id);
    if (!error) {
      setTarifas((current) => current.map((tarifa) => (tarifa.id === id ? { ...tarifa, precio_unidad: precioUnificado } : tarifa)));
    }
    setLoadingAction(false);
  }

  async function handleCrearTarifa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nuevoTarifaProceso || !nuevoTarifaMaterial || nuevoTarifaPrecio <= 0) return;

    setLoadingAction(true);
    const { data, error } = await supabase.from('tarifas').insert([{ proceso: nuevoTarifaProceso, material: nuevoTarifaMaterial, precio_unidad: nuevoTarifaPrecio }]);
    if (data?.[0]) {
      setTarifas((current) => [...current, data[0]]);
      setNuevoTarifaProceso('Picador');
      setNuevoTarifaMaterial('Poli');
      setNuevoTarifaPrecio(0);
    }
    setLoadingAction(false);
  }

  async function handleEliminarTarifa(id: string) {
    const { error } = await supabase.from('tarifas').delete().eq('id', id);
    if (!error) {
      setTarifas((current) => current.filter((tarifa) => tarifa.id !== id));
    }
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

  async function handleCrearPagoAdicional(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pagoEmpleadoId || !nuevoPagoDescripcion.trim() || nuevoPagoValor <= 0) return;

    setLoadingAction(true);
    const { data, error } = await supabase.from('pagos_adicionales').insert([{ empleado_id: pagoEmpleadoId, semana_inicio: weekDates[0], descripcion: nuevoPagoDescripcion.trim(), valor: nuevoPagoValor }]);
    if (data?.[0]) {
      setPagosAdicionales((current) => [...current, data[0]]);
      setNuevoPagoDescripcion('');
      setNuevoPagoValor(0);
      setPagoEmpleadoId('');
    }
    setLoadingAction(false);
  }

  async function handleGuardarNominaSemanal() {
    if (!weekDates.length) return;

    setLoadingAction(true);
    const insertData = empleados.map((empleado) => {
      const totalKg = registros
        .filter((item) => item.empleado_id === empleado.id && weekDates.includes(item.fecha))
        .reduce((sum, item) => sum + (item.peso_kg ?? 0), 0);
      const pagoAdicional = getPagoAdicional(empleado.id);
      const totalPagar = registros
        .filter((item) => item.empleado_id === empleado.id && weekDates.includes(item.fecha))
        .reduce((sum, item) => sum + ((item.peso_kg ?? 0) * getTarifaPrecio(item.proceso, item.material)), 0)
        + pagoAdicional;
      return {
        semana_inicio: weekDates[0],
        empleado_id: empleado.id,
        total_kg: totalKg,
        pago_adicional: pagoAdicional,
        total_pagar: totalPagar
      };
    });

    const { error } = await supabase.from('nominas_semanales').upsert(insertData, { onConflict: 'semana_inicio' });
    if (!error) {
      const { data } = await supabase.from('nominas_semanales').select('*').eq('semana_inicio', weekDates[0]);
      if (data) setNominasSemanales(data as NominaSemanal[]);
    }
    setLoadingAction(false);
  }

  async function handleEliminarPagoAdicional(id: string) {
    const { error } = await supabase.from('pagos_adicionales').delete().eq('id', id);
    if (!error) {
      setPagosAdicionales((current) => current.filter((pago) => pago.id !== id));
    }
  }

  async function handleActualizarRegistroDiario(id: string) {
    const value = registroEditValues[id];
    if (!value) return;
    const nuevoPeso = Number(value);
    if (Number.isNaN(nuevoPeso) || nuevoPeso < 0) return;

    setLoadingAction(true);
    const { data, error } = await supabase.from('registros_diarios').update({ peso_kg: nuevoPeso }).eq('id', id);
    if (!error && data?.[0]) {
      setRegistros((current) => current.map((item) => (item.id === id ? { ...item, peso_kg: nuevoPeso } : item)));
      setRegistroEditValues((current) => ({ ...current, [id]: nuevoPeso.toString() }));
    }
    setLoadingAction(false);
  }

  async function handleToggleActivo(empleado: Empleado) {
    const { data, error } = await supabase.from('empleados').update({ activo: !empleado.activo }).eq('id', empleado.id);
    if (!error && data?.[0]) {
      setEmpleados((current) => current.map((item) => (item.id === empleado.id ? { ...item, activo: (data[0] as Empleado).activo } : item)));
    }
  }

  async function handleActualizarEmpleado(empleado: Empleado) {
    setLoadingAction(true);
    const { data, error } = await supabase.from('empleados').update({ nombre: empleado.nombre, proceso_habitual: empleado.proceso_habitual, activo: empleado.activo }).eq('id', empleado.id);
    if (!error && data?.[0]) {
      setEmpleados((current) => current.map((item) => (item.id === empleado.id ? data[0] : item)));
    }
    setLoadingAction(false);
  }

  async function handleEliminarEmpleado(id: string) {
    const { error } = await supabase.from('empleados').delete().eq('id', id);
    if (!error) {
      setEmpleados((current) => current.filter((item) => item.id !== id));
    }
  }

  function getTarifaPrecio(proceso: string, material: string) {
    return tarifas.find((tarifa) => tarifa.proceso === proceso && tarifa.material === material)?.precio_unidad ?? 0;
  }

  function getPagoAdicional(empleadoId: string) {
    return pagosAdicionales.filter((pago) => pago.empleado_id === empleadoId).reduce((sum, pago) => sum + pago.valor, 0);
  }

  function exportSemanalCsv() {
    const headers = ['Empleado', ...weekDates, 'Total kg', 'Pago adicional', 'Total a pagar'];
    const rows = empleados.map((empleado) => {
      const values = weekDates.map((iso) => {
        const total = registros
          .filter((item) => item.empleado_id === empleado.id && item.fecha === iso)
          .reduce((sum, item) => sum + (item.peso_kg ?? 0), 0);
        return total.toFixed(0);
      });
      const totalKg = values.reduce((sum, cell) => sum + Number(cell), 0);
      const pagoAdicional = getPagoAdicional(empleado.id);
      const totalPago = registros
        .filter((item) => item.empleado_id === empleado.id && weekDates.includes(item.fecha))
        .reduce((sum, item) => sum + ((item.peso_kg ?? 0) * getTarifaPrecio(item.proceso, item.material)), 0)
        + pagoAdicional;
      return [empleado.nombre, ...values, totalKg.toFixed(0), pagoAdicional.toFixed(2), totalPago.toFixed(2)];
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

  if (loading) {
    return <div className="p-8 text-center text-slate-300">Cargando...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <AppHeader
          title="Dashboard de nómina"
          subtitle="Administra tarifas, empleados y revisa el consolidado semanal."
          role={profile?.rol}
          email={user?.email ?? profile?.email}
          onSignOut={handleSignOut}
        />

        <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-4 shadow-lg shadow-slate-950/20">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('gestion')}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${activeTab === 'gestion' ? 'bg-sky-500 text-slate-950' : 'bg-slate-950 text-slate-300 hover:bg-slate-900'}`}
            >
              Gestión de empleados
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tarifas')}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${activeTab === 'tarifas' ? 'bg-sky-500 text-slate-950' : 'bg-slate-950 text-slate-300 hover:bg-slate-900'}`}
            >
              Tarifas por proceso
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('consolidado')}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${activeTab === 'consolidado' ? 'bg-sky-500 text-slate-950' : 'bg-slate-950 text-slate-300 hover:bg-slate-900'}`}
            >
              Consolidado semanal
            </button>
          </div>
        </div>

        {activeTab === 'gestion' && (
          <section className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <h2 className="text-2xl font-semibold">Gestión de empleados</h2>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-300">
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Proceso</th>
                    <th className="px-4 py-3">Activo</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {empleados.map((empleado) => (
                    <tr key={empleado.id} className="border-b border-slate-800 hover:bg-slate-950/60">
                      <td className="px-4 py-3">
                        <input
                          value={empleado.nombre}
                          onChange={(event) => setEmpleados((current) => current.map((item) => item.id === empleado.id ? { ...item, nombre: event.target.value } : item))}
                          className="w-full rounded-2xl bg-slate-950 px-3 py-2 text-slate-100"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={empleado.proceso_habitual}
                          onChange={(event) => setEmpleados((current) => current.map((item) => item.id === empleado.id ? { ...item, proceso_habitual: event.target.value as Empleado['proceso_habitual'] } : item))}
                          className="w-full rounded-2xl bg-slate-950 px-3 py-2 text-slate-100"
                        >
                          {procesos.map((procesoItem) => (
                            <option key={procesoItem} value={procesoItem}>{procesoItem}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={empleado.activo}
                            onChange={() => handleToggleActivo(empleado)}
                            className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-500"
                          />
                          <span className="text-sm">{empleado.activo ? 'Sí' : 'No'}</span>
                        </label>
                      </td>
                      <td className="px-4 py-3 space-x-2">
                        <button
                          type="button"
                          onClick={() => handleActualizarEmpleado(empleado)}
                          disabled={loadingAction}
                          className="rounded-2xl bg-sky-500 px-3 py-2 text-white transition hover:bg-sky-400 disabled:opacity-60"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEliminarEmpleado(empleado.id)}
                          className="rounded-2xl bg-rose-500 px-3 py-2 text-white transition hover:bg-rose-400"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
              <h3 className="text-xl font-semibold">Agregar nuevo empleado</h3>
              <form onSubmit={handleCrearEmpleado} className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Nombre</span>
                  <input
                    value={nuevoEmpleadoNombre}
                    onChange={(event) => setNuevoEmpleadoNombre(event.target.value)}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3"
                    placeholder="Jose, Gloria, Yari"
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Proceso habitual</span>
                  <select
                    value={nuevoEmpleadoProceso}
                    onChange={(event) => setNuevoEmpleadoProceso(event.target.value as Empleado['proceso_habitual'])}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3"
                  >
                    {procesos.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
                  >
                    Añadir empleado
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {activeTab === 'tarifas' && (
          <section className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-semibold">Tarifas por proceso</h2>
                <p className="mt-2 text-slate-400">Edita el precio por kilo para cada proceso y material.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('consolidado')}
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-900"
              >
                Ver consolidado
              </button>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-300">
                    <th className="px-4 py-3">Proceso</th>
                    <th className="px-4 py-3">Material</th>
                    <th className="px-4 py-3">Precio por kilo</th>
                    <th className="px-4 py-3">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {tarifas.map((tarifa) => (
                    <tr key={tarifa.id} className="border-b border-slate-800 hover:bg-slate-950/60">
                      <td className="px-4 py-3">{tarifa.proceso}</td>
                      <td className="px-4 py-3">{materialDisplayNames[tarifa.material]}</td>
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
                          className="w-28 rounded-2xl bg-slate-950 px-3 py-2 text-slate-100"
                        />
                      </td>
                      <td className="px-4 py-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleActualizarTarifa(tarifa.id, tarifa.precio_unidad)}
                          disabled={loadingAction}
                          className="rounded-2xl bg-sky-500 px-3 py-2 text-white transition hover:bg-sky-400 disabled:opacity-60"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEliminarTarifa(tarifa.id)}
                          className="rounded-2xl bg-rose-500 px-3 py-2 text-white transition hover:bg-rose-400"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
              <h3 className="text-xl font-semibold">Agregar nueva tarifa</h3>
              <form onSubmit={handleCrearTarifa} className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Proceso</span>
                  <select
                    value={nuevoTarifaProceso}
                    onChange={(event) => setNuevoTarifaProceso(event.target.value as Tarifa['proceso'])}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3"
                  >
                    {procesos.map((proceso) => (
                      <option key={proceso} value={proceso}>{proceso}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Material</span>
                  <select
                    value={nuevoTarifaMaterial}
                    onChange={(event) => setNuevoTarifaMaterial(event.target.value as Tarifa['material'])}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3"
                  >
                    {materiales.map((material) => (
                      <option key={material} value={material}>{materialDisplayNames[material]}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Precio por kilo</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={nuevoTarifaPrecio}
                    onChange={(event) => setNuevoTarifaPrecio(Number(event.target.value))}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3"
                    placeholder="0.00"
                  />
                </label>
                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    disabled={loadingAction}
                    className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
                  >
                    Crear tarifa
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {activeTab === 'consolidado' && (
          <section className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-semibold">Consolidado semanal</h2>
                <p className="mt-2 text-slate-400">Revisa el total de kilos por empleado en la semana.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
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
            <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-300">
                  <th className="px-4 py-3">Empleado</th>
                  {diasSemana.map((dia, index) => (
                    <th key={dia} className="px-4 py-3">{dia} ({weekDates[index]})</th>
                  ))}
                  <th className="px-4 py-3">Total kg</th>
                  <th className="px-4 py-3">Pago adicional</th>
                  <th className="px-4 py-3">Total a pagar</th>
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
                      {dias.map((valor, index) => {
                    const detalles = getDetallesDelDia(empleado.id, weekDates[index]);
                    return (
                      <td
                        key={`${empleado.id}-${index}`}
                        className="px-4 py-3"
                        title={detalles.length ? detalles.join('\n') : 'Sin registros'}
                      >
                        {valor.toFixed(0)}
                      </td>
                    );
                  })}
                      <td className="px-4 py-3 font-semibold text-sky-300">{total.toFixed(0)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-100">{getPagoAdicional(empleado.id).toFixed(2)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-300">
                        {(
                          registros
                            .filter((item) => item.empleado_id === empleado.id && weekDates.includes(item.fecha))
                            .reduce((sum, item) => sum + ((item.peso_kg ?? 0) * getTarifaPrecio(item.proceso, item.material)), 0)
                          + getPagoAdicional(empleado.id)
                        ).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isAdmin && (
            <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/70 p-6 shadow-lg shadow-slate-950/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold">Registros diarios</h3>
                  <p className="mt-2 text-sm text-slate-400">Edita kilos directamente en los registros. Solo admins pueden guardar cambios.</p>
                </div>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-sm text-slate-300">Permiso admin requerido</span>
              </div>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-300">
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Empleado</th>
                      <th className="px-4 py-3">Proceso</th>
                      <th className="px-4 py-3">Material</th>
                      <th className="px-4 py-3">Kilos</th>
                      <th className="px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registros.map((registro) => (
                      <tr key={registro.id} className="border-b border-slate-800 hover:bg-slate-950/60">
                        <td className="px-4 py-3">{registro.fecha}</td>
                        <td className="px-4 py-3">{empleados.find((emp) => emp.id === registro.empleado_id)?.nombre ?? 'Empleado'}</td>
                        <td className="px-4 py-3">{registro.proceso}</td>
                        <td className="px-4 py-3">{materialDisplayNames[registro.material]}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={registroEditValues[registro.id] ?? registro.peso_kg?.toString() ?? ''}
                            onChange={(event) => setRegistroEditValues((current) => ({ ...current, [registro.id]: event.target.value }))}
                            className="w-28 rounded-2xl bg-slate-950 px-3 py-2 text-slate-100"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleActualizarRegistroDiario(registro.id)}
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
          )}

          <div className="mt-8 grid gap-6 xl:grid-cols-[2fr_1fr]">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 shadow-lg shadow-slate-950/20">
              <h3 className="text-xl font-semibold">Pagos adicionales</h3>
              <form onSubmit={handleCrearPagoAdicional} className="mt-4 grid gap-4 md:grid-cols-4">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Empleado</span>
                  <select
                    value={pagoEmpleadoId}
                    onChange={(event) => setPagoEmpleadoId(event.target.value)}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3"
                  >
                    <option value="">Seleccione empleado</option>
                    {empleados.map((empleado) => (
                      <option key={empleado.id} value={empleado.id}>{empleado.nombre}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Descripción</span>
                  <input
                    value={nuevoPagoDescripcion}
                    onChange={(event) => setNuevoPagoDescripcion(event.target.value)}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3"
                    placeholder="Trabajo externo"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Valor</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={nuevoPagoValor}
                    onChange={(event) => setNuevoPagoValor(Number(event.target.value))}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3"
                    placeholder="0.00"
                  />
                </label>
                <button
                  type="submit"
                  disabled={loadingAction}
                  className="h-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
                >
                  Agregar pago
                </button>
              </form>
              <div className="mt-6 space-y-3">
                {pagosAdicionales.map((pago) => (
                  <div key={pago.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/95 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-white">{empleados.find((emp) => emp.id === pago.empleado_id)?.nombre ?? 'Empleado'}</p>
                      <p className="text-sm text-slate-400">{pago.descripcion}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-emerald-300">{pago.valor.toFixed(2)}</span>
                      <button
                        type="button"
                        onClick={() => handleEliminarPagoAdicional(pago.id)}
                        className="rounded-2xl bg-rose-500 px-3 py-2 text-sm text-white transition hover:bg-rose-400"
                      >Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 shadow-lg shadow-slate-950/20">
              <h3 className="text-xl font-semibold">Nómina semanal</h3>
              <p className="mt-2 text-slate-400">Guarda el total de pagos para esta semana.</p>
              <button
                type="button"
                onClick={handleGuardarNominaSemanal}
                disabled={loadingAction}
                className="mt-6 w-full rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
              >
                Guardar nómina semanal
              </button>
              <div className="mt-6 space-y-3 text-slate-300">
                <p>Total empleados: {empleados.length}</p>
                <p>Total pagos extras: {pagosAdicionales.reduce((sum, pago) => sum + pago.valor, 0).toFixed(2)}</p>
                <p className="font-semibold">Total a pagar general: {empleados.reduce((sum, empleado) => sum + (registros.filter((item) => item.empleado_id === empleado.id && weekDates.includes(item.fecha)).reduce((inner, item) => inner + ((item.peso_kg ?? 0) * getTarifaPrecio(item.proceso, item.material)), 0) + getPagoAdicional(empleado.id)), 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </section>
        )}

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
                  <span>{materialDisplayNames[material]}</span>
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
