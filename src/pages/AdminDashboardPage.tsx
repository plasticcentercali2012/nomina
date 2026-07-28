import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { AppHeader } from '../components/AppHeader';
import { Empleado, NominaSemanal, PagoAdicional, RegistroDiario, Tarifa, UsuarioSistema } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Icon } from '../components/ui/Icon';
import { LoadingScreen } from '../components/ui/LoadingScreen';

const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;
const procesos = ['Picador', 'Lavador', 'Aglutinador','Encargado'] as const;
const materiales = ['Poli', 'M', 'T'] as const;
const materialDisplayNames: Record<typeof materiales[number], string> = {
  Poli: 'Policolor',
  M: 'Mono',
  T: 'Termo',
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
}

function parseCurrencyInput(value: string) {
  return Number(value.replace(/\D/g, '')) || 0;
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits ? new Intl.NumberFormat('es-CO').format(Number(digits)) : '';
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
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState('');
  const [selectedWeekDate, setSelectedWeekDate] = useState('');
  const [adminRegistroEmpleadoId, setAdminRegistroEmpleadoId] = useState('');
  const [adminRegistroDate, setAdminRegistroDate] = useState(new Date().toISOString().slice(0, 10));
  const [adminRegistroProceso, setAdminRegistroProceso] = useState<RegistroDiario['proceso']>('Picador');
  const [adminRegistroMaterial, setAdminRegistroMaterial] = useState<RegistroDiario['material']>('Poli');
  const [adminRegistroKilos, setAdminRegistroKilos] = useState('');
  const [registroEditValues, setRegistroEditValues] = useState<Record<string, string>>({});
  const [nuevoEmpleadoNombre, setNuevoEmpleadoNombre] = useState('');
  const [nuevoEmpleadoProceso, setNuevoEmpleadoProceso] = useState<Empleado['proceso_habitual']>('Picador');
  const [nuevoTarifaProceso, setNuevoTarifaProceso] = useState<Tarifa['proceso']>('Picador');
  const [nuevoTarifaMaterial, setNuevoTarifaMaterial] = useState<Tarifa['material']>('Poli');
  const [nuevoTarifaPrecio, setNuevoTarifaPrecio] = useState<number>(0);
  const [nuevoPagoDescripcion, setNuevoPagoDescripcion] = useState('');
  const [nuevoPagoValor, setNuevoPagoValor] = useState('');
  const [pagoEmpleadoId, setPagoEmpleadoId] = useState<string>('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [activeTab, setActiveTab] = useState<'gestion' | 'tarifas' | 'consolidado' | 'analitica'>('gestion');
  const [periodoAnalitica, setPeriodoAnalitica] = useState<'dia' | 'semana' | 'mes'>('semana');
  const [fechaAnalitica, setFechaAnalitica] = useState(new Date().toISOString().slice(0, 10));
  const [registrosAnalitica, setRegistrosAnalitica] = useState<RegistroDiario[]>([]);
  const [cargandoAnalitica, setCargandoAnalitica] = useState(false);

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

  const rangoAnalitica = useMemo(() => {
    const base = new Date(`${fechaAnalitica}T12:00:00`);
    let inicio = new Date(base);
    let fin = new Date(base);
    if (periodoAnalitica === 'semana') {
      const desplazamiento = base.getDay() === 0 ? -6 : 1 - base.getDay();
      inicio.setDate(base.getDate() + desplazamiento);
      fin = new Date(inicio);
      fin.setDate(inicio.getDate() + 5);
    }
    if (periodoAnalitica === 'mes') {
      inicio = new Date(base.getFullYear(), base.getMonth(), 1, 12);
      fin = new Date(base.getFullYear(), base.getMonth() + 1, 0, 12);
    }
    return { inicio: inicio.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) };
  }, [fechaAnalitica, periodoAnalitica]);

  useEffect(() => {
    if (activeTab !== 'analitica') return;
    setCargandoAnalitica(true);
    supabase
      .from('registros_diarios')
      .select('*')
      .gte('fecha', rangoAnalitica.inicio)
      .lte('fecha', rangoAnalitica.fin)
      .order('fecha', { ascending: true })
      .then(({ data }) => {
        setRegistrosAnalitica((data as RegistroDiario[]) ?? []);
        setCargandoAnalitica(false);
      });
  }, [activeTab, rangoAnalitica]);

  useEffect(() => {
    if (empleados.length && !selectedEmpleadoId) {
      setSelectedEmpleadoId(empleados[0].id);
    }
    if (empleados.length && !adminRegistroEmpleadoId) {
      setAdminRegistroEmpleadoId(empleados[0].id);
    }
  }, [empleados, selectedEmpleadoId, adminRegistroEmpleadoId]);

  useEffect(() => {
    if (weekDates.length && !selectedWeekDate) {
      setSelectedWeekDate(weekDates[0]);
      setAdminRegistroDate(weekDates[0]);
    }
  }, [weekDates, selectedWeekDate]);

  useEffect(() => {
    const empleado = empleados.find((item) => item.id === adminRegistroEmpleadoId);
    if (empleado) {
      setAdminRegistroProceso(empleado.proceso_habitual);
    }
  }, [adminRegistroEmpleadoId, empleados]);

  const registrosPorEmpleadoYDia = useMemo(() => {
    if (!selectedEmpleadoId || !selectedWeekDate) return [];
    return registros.filter(
      (item) => item.empleado_id === selectedEmpleadoId && item.fecha === selectedWeekDate
    );
  }, [registros, selectedEmpleadoId, selectedWeekDate]);

  const selectedEmpleadoName = useMemo(
    () => empleados.find((item) => item.id === selectedEmpleadoId)?.nombre ?? '',
    [empleados, selectedEmpleadoId]
  );

  async function handleAdminCrearRegistro() {
    if (!adminRegistroEmpleadoId || !adminRegistroKilos) return;
    const kilos = Number(adminRegistroKilos);
    if (Number.isNaN(kilos) || kilos < 0) return;

    setLoadingAction(true);
    const newRecord = {
      empleado_id: adminRegistroEmpleadoId,
      fecha: adminRegistroDate,
      proceso: adminRegistroProceso,
      material: adminRegistroMaterial,
      peso_kg: kilos,
      cantidad_bultos: null,
      creado_por: profile?.id ?? ''
    };

    const { data, error } = await supabase.from('registros_diarios').insert(newRecord);
    if (!error && data?.[0]) {
      setRegistros((current) => [...current, data[0] as RegistroDiario]);
      setAdminRegistroKilos('');
    }
    setLoadingAction(false);
  }

  const estadisticas = useMemo(() => {
    return {
      procesos: registrosAnalitica.reduce<Record<string, number>>((acc, registro) => {
        acc[registro.proceso] = (acc[registro.proceso] ?? 0) + (registro.peso_kg ?? 0);
        return acc;
      }, {}),
      materiales: registrosAnalitica.reduce<Record<string, number>>((acc, registro) => {
        acc[registro.material] = (acc[registro.material] ?? 0) + (registro.peso_kg ?? 0);
        return acc;
      }, {})
    };
  }, [registrosAnalitica]);

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
    const valorPago = parseCurrencyInput(nuevoPagoValor);
    if (!pagoEmpleadoId || !nuevoPagoDescripcion.trim() || valorPago <= 0) return;

    setLoadingAction(true);
    const { data, error } = await supabase.from('pagos_adicionales').insert([{ empleado_id: pagoEmpleadoId, semana_inicio: weekDates[0], descripcion: nuevoPagoDescripcion.trim(), valor: valorPago }]);
    if (data?.[0]) {
      setPagosAdicionales((current) => [...current, data[0]]);
      setNuevoPagoDescripcion('');
      setNuevoPagoValor('');
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

  function exportAnaliticaCsv() {
    const encabezados = ['Fecha', 'Empleado', 'Proceso', 'Material', 'Kilos'];
    const filas = registrosAnalitica.map((registro) => [
      registro.fecha,
      empleados.find((empleado) => empleado.id === registro.empleado_id)?.nombre ?? 'Empleado',
      registro.proceso,
      materialDisplayNames[registro.material],
      registro.peso_kg ?? 0
    ]);
    const escapar = (valor: string | number) => `"${String(valor).replace(/"/g, '""')}"`;
    const csv = '\uFEFF' + [encabezados, ...filas].map((fila) => fila.map(escapar).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `volumen_${periodoAnalitica}_${rangoAnalitica.inicio}_${rangoAnalitica.fin}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <LoadingScreen label="Preparando el dashboard" />;
  }

  return (
    <div className="app-bg">
        <AppHeader
          title="Dashboard de nómina"
          subtitle="Administra tarifas, empleados y revisa el consolidado semanal."
          role={profile?.rol}
          email={user?.email ?? profile?.email}
          onSignOut={handleSignOut}
        />
      <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div><p className="eyebrow">Centro de control</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">Resumen de nómina</h2><p className="mt-1 text-sm text-slate-400">Gestiona la operación, tarifas y cierres desde un solo lugar.</p></div>
          <div className="badge-success w-fit"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Sistema operativo</div>
        </div>

        <nav aria-label="Módulos del dashboard" className="card p-2">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setActiveTab('gestion')}
              className={`flex items-center justify-center gap-2 rounded-xl border-0 px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${activeTab === 'gestion' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-950/30' : 'bg-transparent text-slate-400 hover:bg-slate-800/70 hover:text-white'}`}
            >
              <Icon name="users" className="h-4 w-4" /><span className="hidden sm:inline">Gestión de </span>empleados
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tarifas')}
              className={`flex items-center justify-center gap-2 rounded-xl border-0 px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${activeTab === 'tarifas' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-950/30' : 'bg-transparent text-slate-400 hover:bg-slate-800/70 hover:text-white'}`}
            >
              <Icon name="wallet" className="h-4 w-4" /> Tarifas
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('consolidado')}
              className={`flex items-center justify-center gap-2 rounded-xl border-0 px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${activeTab === 'consolidado' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-950/30' : 'bg-transparent text-slate-400 hover:bg-slate-800/70 hover:text-white'}`}
            >
              <Icon name="grid" className="h-4 w-4" /> Consolidado
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('analitica')}
              className={`flex items-center justify-center gap-2 rounded-xl border-0 px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${activeTab === 'analitica' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-950/30' : 'bg-transparent text-slate-400 hover:bg-slate-800/70 hover:text-white'}`}
            >
              <Icon name="activity" className="h-4 w-4" /> Analítica
            </button>
          </div>
        </nav>

        {activeTab === 'gestion' && (
          <section className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <h2 className="text-2xl font-semibold">Gestión de empleados</h2>
            <div className="responsive-table mt-6 overflow-x-auto">
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
            <div className="responsive-table mt-6 overflow-x-auto">
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
          <section className="space-y-6">
          <div className="card overflow-hidden">
            <div className="p-5 sm:p-6">
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
            </div>
            <div className="overflow-x-auto border-t border-slate-800">
            <table className="min-w-[1280px] border-collapse text-left text-sm">
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
                      <td className="px-4 py-3 font-semibold text-slate-100">{formatCurrency(getPagoAdicional(empleado.id))}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-300">
                        {formatCurrency(
                          registros
                            .filter((item) => item.empleado_id === empleado.id && weekDates.includes(item.fecha))
                            .reduce((sum, item) => sum + ((item.peso_kg ?? 0) * getTarifaPrecio(item.proceso, item.material)), 0)
                          + getPagoAdicional(empleado.id)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>

          <div className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">Detalle por empleado</h3>
                <p className="mt-2 text-sm text-slate-400">Selecciona empleado y día de la semana para ver todos los registros exactos tal como se ingresaron.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Empleado</span>
                <select
                  value={selectedEmpleadoId}
                  onChange={(event) => setSelectedEmpleadoId(event.target.value)}
                  className="w-full rounded-2xl bg-slate-900 px-4 py-3"
                >
                  {empleados.map((empleado) => (
                    <option key={empleado.id} value={empleado.id}>{empleado.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Fecha</span>
                <input
                  type="date"
                  value={selectedWeekDate}
                  min={weekDates[0]}
                  max={weekDates[weekDates.length - 1]}
                  onChange={(event) => setSelectedWeekDate(event.target.value)}
                  className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-slate-100"
                />
              </label>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-4 text-sm text-slate-300">
              <div className="rounded-3xl bg-slate-900/95 p-4">
                <p className="text-slate-500">Empleado</p>
                <p className="mt-2 font-semibold text-white">{selectedEmpleadoName || 'Sin empleado'}</p>
              </div>
              <div className="rounded-3xl bg-slate-900/95 p-4">
                <p className="text-slate-500">Fecha seleccionada</p>
                <p className="mt-2 font-semibold text-white">{selectedWeekDate || 'Sin fecha'}</p>
              </div>
              <div className="rounded-3xl bg-slate-900/95 p-4">
                <p className="text-slate-500">Día</p>
                <p className="mt-2 font-semibold text-white">{weekDates.includes(selectedWeekDate) ? diasSemana[weekDates.indexOf(selectedWeekDate)] : '-'}</p>
              </div>
              <div className="rounded-3xl bg-slate-900/95 p-4">
                <p className="text-slate-500">Registros</p>
                <p className="mt-2 font-semibold text-white">{registrosPorEmpleadoYDia.length}</p>
              </div>
            </div>

            <div className="responsive-table mt-6 overflow-x-auto">
              {registrosPorEmpleadoYDia.length === 0 ? (
                <p className="rounded-3xl border border-slate-800 bg-slate-900/95 p-4 text-sm text-slate-400">No hay registros para este empleado y día.</p>
              ) : (
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-300">
                      <th className="px-4 py-3">Proceso</th>
                      <th className="px-4 py-3">Material</th>
                      <th className="px-4 py-3">Kilos</th>
                      <th className="px-4 py-3">Cantidad</th>
                      <th className="px-4 py-3">Creado por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrosPorEmpleadoYDia.map((registro) => (
                      <tr key={registro.id} className="border-b border-slate-800 hover:bg-slate-950/60">
                        <td className="px-4 py-3">{registro.proceso}</td>
                        <td className="px-4 py-3">{materialDisplayNames[registro.material]}</td>
                        <td className="px-4 py-3">{registro.peso_kg?.toFixed(0) ?? 0} kg</td>
                        <td className="px-4 py-3">{registro.cantidad_bultos ?? '-'}</td>
                        <td className="px-4 py-3">{registro.creado_por || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold">Ingreso libre de kilos</h3>
                  <p className="mt-2 text-sm text-slate-400">Como admin puedes registrar un peso para cualquier fecha. Replica la pantalla de carga diaria pero con fecha habilitada.</p>
                </div>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-sm text-slate-300">Solo admin</span>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Fecha</span>
                  <input
                    type="date"
                    value={adminRegistroDate}
                    onChange={(event) => setAdminRegistroDate(event.target.value)}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Empleado</span>
                  <select
                    value={adminRegistroEmpleadoId}
                    onChange={(event) => setAdminRegistroEmpleadoId(event.target.value)}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3"
                  >
                    {empleados.map((empleado) => (
                      <option key={empleado.id} value={empleado.id}>{empleado.nombre}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Kilos / gramos</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={adminRegistroKilos}
                    onChange={(event) => setAdminRegistroKilos(event.target.value)}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3"
                    placeholder="0.0"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Proceso</span>
                  <select
                    value={adminRegistroProceso}
                    onChange={(event) => setAdminRegistroProceso(event.target.value as RegistroDiario['proceso'])}
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
                    value={adminRegistroMaterial}
                    onChange={(event) => setAdminRegistroMaterial(event.target.value as RegistroDiario['material'])}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3"
                  >
                    {materiales.map((material) => (
                      <option key={material} value={material}>{materialDisplayNames[material]}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={handleAdminCrearRegistro}
                  disabled={loadingAction}
                  className="h-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
                >
                  Registrar kilos
                </button>
              </div>
              <div className="responsive-table mt-6 overflow-x-auto">
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

          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <div className="card p-5 sm:p-6">
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
                  <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-slate-500">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={nuevoPagoValor}
                    onChange={(event) => setNuevoPagoValor(formatCurrencyInput(event.target.value))}
                    className="w-full rounded-2xl bg-slate-900 py-3 pl-9 pr-4"
                    placeholder="9.000"
                    aria-label="Valor del pago adicional en pesos colombianos"
                  />
                  </div>
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
                      <span className="font-semibold text-emerald-300">{formatCurrency(pago.valor)}</span>
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
            <div className="card p-5 sm:p-6">
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
                <p>Total pagos extras: {formatCurrency(pagosAdicionales.reduce((sum, pago) => sum + pago.valor, 0))}</p>
                <p className="font-semibold">Total a pagar general: {formatCurrency(empleados.reduce((sum, empleado) => sum + (registros.filter((item) => item.empleado_id === empleado.id && weekDates.includes(item.fecha)).reduce((inner, item) => inner + ((item.peso_kg ?? 0) * getTarifaPrecio(item.proceso, item.material)), 0) + getPagoAdicional(empleado.id)), 0))}</p>
              </div>
            </div>
          </div>
        </section>
        )}

        {activeTab === 'analitica' && (
        <section className="space-y-6">
          <div className="card p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <p className="eyebrow">Análisis operativo</p>
                <h2 className="mt-1 text-2xl font-bold text-white">Volumen de producción</h2>
                <p className="mt-1 text-sm text-slate-400">Datos obtenidos directamente de los registros diarios.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-400">Periodo</label>
                  <div className="flex rounded-xl border border-slate-800 bg-slate-950 p-1">
                    {(['dia', 'semana', 'mes'] as const).map((periodo) => (
                      <button key={periodo} type="button" onClick={() => setPeriodoAnalitica(periodo)}
                        className={`rounded-lg border-0 px-3 py-2 text-xs font-semibold capitalize transition ${periodoAnalitica === periodo ? 'bg-indigo-500 text-white' : 'bg-transparent text-slate-500 hover:text-slate-200'}`}>
                        {periodo === 'dia' ? 'Día' : periodo}
                      </button>
                    ))}
                  </div>
                </div>
                <label>
                  <span className="mb-2 block text-xs font-semibold text-slate-400">Fecha de referencia</span>
                  <input type="date" value={fechaAnalitica} onChange={(event) => setFechaAnalitica(event.target.value)} className="field" />
                </label>
                <button type="button" onClick={exportAnaliticaCsv} disabled={!registrosAnalitica.length} className="btn-secondary">
                  <Icon name="download" className="h-4 w-4" /> Exportar CSV
                </button>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4 text-xs text-slate-400">
              <span className="badge bg-indigo-500/10 text-indigo-300 ring-indigo-500/20">
                {rangoAnalitica.inicio === rangoAnalitica.fin ? rangoAnalitica.inicio : `${rangoAnalitica.inicio} — ${rangoAnalitica.fin}`}
              </span>
              <span>{registrosAnalitica.length} registros encontrados</span>
            </div>
          </div>
          {cargandoAnalitica ? (
            <div className="card grid min-h-64 place-items-center"><div className="text-center"><span className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-indigo-400/20 border-t-indigo-400" /><p className="mt-3 text-sm text-slate-500">Consultando producción…</p></div></div>
          ) : (
          <>
          <div className="grid gap-6 lg:grid-cols-2">
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
                <p className="text-3xl font-semibold text-sky-300">{registrosAnalitica.length}</p>
              </div>
              <div className="rounded-3xl bg-slate-950/70 px-4 py-3">
                <p>Total kg del periodo</p>
                <p className="text-3xl font-semibold text-sky-300">{registrosAnalitica.reduce((sum, item) => sum + (item.peso_kg ?? 0), 0).toLocaleString('es-CO')} kg</p>
              </div>
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-800 p-5 sm:flex-row sm:items-center">
              <div><h3 className="font-bold text-white">Detalle del periodo</h3><p className="mt-1 text-xs text-slate-500">Trazabilidad por fecha, empleado, proceso y material.</p></div>
              <span className="badge-success">{registrosAnalitica.reduce((sum, item) => sum + (item.peso_kg ?? 0), 0).toLocaleString('es-CO')} kg</span>
            </div>
            {registrosAnalitica.length === 0 ? (
              <div className="grid min-h-40 place-items-center p-6 text-center"><div><Icon name="file" className="mx-auto h-8 w-8 text-slate-700" /><p className="mt-3 text-sm text-slate-500">No hay producción registrada en este periodo.</p></div></div>
            ) : (
              <div className="responsive-table overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr><th className="px-5 py-3">Fecha</th><th className="px-5 py-3">Empleado</th><th className="px-5 py-3">Proceso</th><th className="px-5 py-3">Material</th><th className="px-5 py-3 text-right">Volumen</th></tr></thead>
                  <tbody>
                    {registrosAnalitica.map((registro) => (
                      <tr key={registro.id} className="border-t border-slate-800/70">
                        <td data-label="Fecha" className="px-5 py-3">{registro.fecha}</td>
                        <td data-label="Empleado" className="px-5 py-3 font-medium text-white">{empleados.find((empleado) => empleado.id === registro.empleado_id)?.nombre ?? 'Empleado'}</td>
                        <td data-label="Proceso" className="px-5 py-3">{registro.proceso}</td>
                        <td data-label="Material" className="px-5 py-3">{materialDisplayNames[registro.material]}</td>
                        <td data-label="Volumen" className="px-5 py-3 text-right font-semibold text-indigo-300">{(registro.peso_kg ?? 0).toLocaleString('es-CO')} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </>
          )}
        </section>
        )}
      </main>
    </div>
  );
}
