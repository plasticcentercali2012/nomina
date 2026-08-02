import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { formatLocalDate } from '../lib/dateUtils';
import { AppHeader } from '../components/AppHeader';
import { CatalogoMaterial, CatalogoProceso, Empleado, Material, Proceso, RegistroDiario } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Icon } from '../components/ui/Icon';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { Toast } from '../components/ui/Toast';
import { empleadoSoloLavador, empleadoTieneEtapa, etapaDelProceso, procesosPrincipalesEmpleado } from '../lib/productionFlow';

type EmpleadoRow = Omit<Empleado, 'procesos_asignados'> & {
  empleado_procesos?: Array<{ proceso: Proceso }>;
};

function normalizeEmpleado(row: EmpleadoRow): Empleado {
  const asignados = row.empleado_procesos?.map((item) => item.proceso) ?? [];
  return {
    ...row,
    procesos_asignados: asignados.length ? asignados : [row.proceso_habitual]
  };
}

function esMaterialSoplado(material: CatalogoMaterial) {
  const nombre = material.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const codigo = material.codigo.trim().toLowerCase();
  return nombre === 'soplado' || codigo === 'soplado';
}

export function CargaDiariaPage() {
  const { profile, loading, signOut, user } = useAuth();
  const navigate = useNavigate();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [catalogoProcesos, setCatalogoProcesos] = useState<CatalogoProceso[]>([]);
  const [catalogoMateriales, setCatalogoMateriales] = useState<CatalogoMaterial[]>([]);
  const [fecha] = useState(formatLocalDate(new Date()));
  const [empleadoId, setEmpleadoId] = useState('');
  const [proceso, setProceso] = useState<Proceso>('Picador');
  const [material, setMaterial] = useState<Material>('Poli');
  const [empleadoPareadoId, setEmpleadoPareadoId] = useState('');
  const [valor, setValor] = useState('');
  const [sopladoKg, setSopladoKg] = useState('0');
  const [ajustesSoplado, setAjustesSoplado] = useState<RegistroDiario[]>([]);
  const [savingSoplado, setSavingSoplado] = useState(false);
  const [registros, setRegistros] = useState<RegistroDiario[]>([]);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    supabase.from('procesos').select('nombre').order('nombre').then(({ data }) => data && setCatalogoProcesos(data as CatalogoProceso[]));
    supabase.from('materiales').select('codigo,nombre,requiere_lavado,requiere_aglutinado').order('nombre').then(({ data }) => setCatalogoMateriales((data as CatalogoMaterial[]) ?? []));
    supabase
      .from('empleados')
      .select('*, empleado_procesos(proceso)')
      .eq('activo', true)
      .order('nombre', { ascending: true })
      .then(({ data }) => {
        if (data) {
          const empleadosData = (data as EmpleadoRow[]).map(normalizeEmpleado);
          setEmpleados(empleadosData);
          const primeroSeleccionable = empleadosData.find((empleado) => !empleadoSoloLavador(empleado));
          setEmpleadoId(primeroSeleccionable?.id ?? '');
          const procesosPrincipales = primeroSeleccionable ? procesosPrincipalesEmpleado(primeroSeleccionable) : [];
          const procesoAglutinado = procesosPrincipales.find((item) => etapaDelProceso(item) === 'aglutinado');
          setProceso(procesoAglutinado ?? procesosPrincipales[0] ?? 'Picador');
        }
      });
  }, []);

  useEffect(() => {
    if (!empleadoId || !fecha) return;
    const empleado = empleados.find((item) => item.id === empleadoId);
    if (empleado) {
      const principales = procesosPrincipalesEmpleado(empleado);
      const aglutinado = principales.find((item) => etapaDelProceso(item) === 'aglutinado');
      const tieneAmbos = empleadoTieneEtapa(empleado, 'lavado') && empleadoTieneEtapa(empleado, 'aglutinado');
      setProceso((actual) => tieneAmbos && aglutinado ? aglutinado : principales.includes(actual) ? actual : principales[0] ?? empleado.proceso_habitual);
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

  useEffect(() => {
    supabase
      .from('registros_diarios')
      .select('*')
      .eq('fecha', fecha)
      .eq('es_ajuste_soplado', true)
      .order('proceso')
      .then(({ data }) => {
        const ajustes = (data as RegistroDiario[]) ?? [];
        setAjustesSoplado(ajustes);
        setSopladoKg(ajustes.length ? Math.abs(ajustes[0].peso_kg ?? 0).toString() : '0');
      });
  }, [fecha]);

  const totalKilos = useMemo(
    () => registros.reduce((sum, item) => sum + (item.peso_kg ?? 0), 0),
    [registros]
  );
  const registrosProduccion = useMemo(
    () => registros.filter((item) => !item.es_ajuste_soplado),
    [registros]
  );

  const procesos = useMemo(() => catalogoProcesos.map((item) => item.nombre), [catalogoProcesos]);
  const materialDisplayNames = useMemo(
    () => Object.fromEntries(catalogoMateriales.map((item) => [item.codigo, item.nombre])) as Record<string, string>,
    [catalogoMateriales]
  );

  const procesosDisponibles = useMemo(
    () => {
      const empleado = empleados.find((item) => item.id === empleadoId);
      return empleado ? procesosPrincipalesEmpleado(empleado) : procesos.filter((item) => etapaDelProceso(item) !== 'lavado');
    },
    [empleadoId, empleados, procesos]
  );

  const etapaActual = etapaDelProceso(proceso);
  const materialSeleccionado = useMemo(
    () => catalogoMateriales.find((item) => item.codigo === material),
    [catalogoMateriales, material]
  );
  const codigoSoplado = useMemo(
    () => catalogoMateriales.find(esMaterialSoplado)?.codigo ?? '',
    [catalogoMateriales]
  );
  const materialesDisponibles = useMemo(() => catalogoMateriales.filter((item) => {
    if (esMaterialSoplado(item)) return false;
    if (etapaActual === 'lavado') return item.requiere_lavado;
    if (etapaActual === 'aglutinado') return item.requiere_aglutinado;
    return true;
  }), [catalogoMateriales, etapaActual]);
  const requiereRegistroPareado = Boolean(
    etapaActual
    && materialSeleccionado?.requiere_lavado
    && materialSeleccionado?.requiere_aglutinado
  );
  const etapaPareada = etapaActual === 'lavado' ? 'aglutinado' : etapaActual === 'aglutinado' ? 'lavado' : null;
  const procesoPareado = useMemo(
    () => catalogoProcesos.find((item) => etapaDelProceso(item.nombre) === etapaPareada)?.nombre ?? '',
    [catalogoProcesos, etapaPareada]
  );
  const empleadosPareados = useMemo(
    () => empleados.filter((empleado) => empleado.id !== empleadoId && empleadoTieneEtapa(empleado, 'lavado')),
    [empleadoId, empleados]
  );
  const ajusteSopladoRegistrado = ajustesSoplado.length > 0;

  useEffect(() => {
    const codigosDisponibles = materialesDisponibles.map((item) => item.codigo);
    if (codigosDisponibles.length && !codigosDisponibles.includes(material)) {
      setMaterial(codigosDisponibles[0]);
    }
  }, [material, materialesDisponibles]);

  useEffect(() => {
    if (!requiereRegistroPareado) {
      setEmpleadoPareadoId('');
      return;
    }
    setEmpleadoPareadoId(empleadosPareados[0]?.id ?? '');
  }, [empleadoId, empleadosPareados, requiereRegistroPareado]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empleadoId || !valor) return;
    if (requiereRegistroPareado && (!procesoPareado || !empleadoPareadoId)) {
      setErrorMessage(`Asigna un empleado al proceso ${procesoPareado || etapaPareada || 'complementario'} antes de registrar.`);
      return;
    }
    if (requiereRegistroPareado && empleadoPareadoId === empleadoId) {
      setErrorMessage('El Aglutinador y el Lavador deben ser empleados diferentes.');
      return;
    }
    if (requiereRegistroPareado && !ajusteSopladoRegistrado && !codigoSoplado) {
      setErrorMessage('No se encontró el material interno Soplado. Aplica la migración antes de registrar.');
      return;
    }
    const peso = Number(valor);
    if (!Number.isFinite(peso) || peso <= 0) {
      setErrorMessage('Ingresa un peso mayor que cero.');
      return;
    }
    const cantidadSoplado = Number(sopladoKg || 0);
    if (!Number.isFinite(cantidadSoplado) || cantidadSoplado < 0) {
      setErrorMessage('La cantidad de soplado no puede ser negativa.');
      return;
    }
    setSaving(true);
    setErrorMessage('');

    const newEntry = {
      empleado_id: empleadoId,
      fecha,
      proceso,
      material,
      peso_kg: peso,
      cantidad_bultos: null,
      creado_por: profile?.id ?? ''
    };

    const entries: Array<Omit<RegistroDiario, 'id'>> = requiereRegistroPareado ? [
      newEntry,
      { ...newEntry, empleado_id: empleadoPareadoId, proceso: procesoPareado }
    ] : [newEntry];

    if (requiereRegistroPareado && !ajusteSopladoRegistrado) {
      entries.push(
        { ...newEntry, material: codigoSoplado, material_referencia: material, peso_kg: -cantidadSoplado, es_ajuste_soplado: true },
        { ...newEntry, empleado_id: empleadoPareadoId, proceso: procesoPareado, material: codigoSoplado, material_referencia: material, peso_kg: -cantidadSoplado, es_ajuste_soplado: true }
      );
    }

    const { data, error } = await supabase
      .from('registros_diarios')
      .insert(entries)
      .select();
    if (!error && data) {
      setValor('');
      setSuccessMessage(requiereRegistroPareado ? 'Lavado y aglutinado registrados para ambos empleados.' : 'Registro exitoso');
      setTimeout(() => setSuccessMessage(''), 3000);
      const nuevosDelEmpleado = (data as RegistroDiario[]).filter((item) => item.empleado_id === empleadoId);
      if (nuevosDelEmpleado.length) setRegistros((current) => [...current, ...nuevosDelEmpleado]);
      const ajustesCreados = (data as RegistroDiario[]).filter((item) => item.es_ajuste_soplado);
      if (ajustesCreados.length) setAjustesSoplado(ajustesCreados);
    } else {
      setErrorMessage('No se pudo registrar. Intenta nuevamente.');
      setTimeout(() => setErrorMessage(''), 4000);
    }

    setSaving(false);
  }

  async function handleActualizarSoplado() {
    const cantidad = Number(sopladoKg || 0);
    if (!Number.isFinite(cantidad) || cantidad < 0 || !ajusteSopladoRegistrado) return;
    setSavingSoplado(true);
    setErrorMessage('');
    const { data, error } = await supabase
      .from('registros_diarios')
      .update({ peso_kg: -cantidad })
      .eq('fecha', fecha)
      .eq('es_ajuste_soplado', true)
      .select();
    if (!error && data) {
      const actualizados = data as RegistroDiario[];
      setAjustesSoplado(actualizados);
      setRegistros((current) => current.map((registro) => actualizados.find((item) => item.id === registro.id) ?? registro));
      setSuccessMessage('Cantidad de soplado actualizada para lavado y aglutinado.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } else {
      setErrorMessage('No se pudo actualizar el soplado del día.');
    }
    setSavingSoplado(false);
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
                    <option key={empleado.id} value={empleado.id} disabled={empleadoSoloLavador(empleado)}>
                      {empleado.nombre}{empleadoSoloLavador(empleado) ? ' · Solo Lavador' : ''}
                    </option>
                  ))}
                </select>
                <span className="block text-xs text-slate-500">Los empleados asignados únicamente a Lavado se eligen como complemento del Aglutinador.</span>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Proceso</span>
                <select
                  value={proceso}
                  onChange={(event) => setProceso(event.target.value as Proceso)}
                  disabled={procesosDisponibles.length <= 1}
                  className="field"
                >
                  {procesosDisponibles.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Material</span>
                <select value={material} onChange={(event) => setMaterial(event.target.value as Material)} className="field">
                  {materialesDisponibles.map((item) => (
                    <option key={item.codigo} value={item.codigo}>{item.nombre}</option>
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

              {requiereRegistroPareado && (
                <div className="card-muted space-y-4 p-4 sm:col-span-2">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-300">
                      <Icon name="activity" className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Proceso complementario requerido</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        {materialSeleccionado?.nombre} requiere lavado y aglutinado. El mismo peso se asignará automáticamente a los dos empleados.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm text-slate-300">Proceso complementario</span>
                      <select value={procesoPareado} disabled className="field">
                        <option value={procesoPareado}>{procesoPareado || 'No configurado'}</option>
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-slate-300">Empleado de {procesoPareado || 'proceso complementario'}</span>
                      <select
                        value={empleadoPareadoId}
                        onChange={(event) => setEmpleadoPareadoId(event.target.value)}
                        disabled={empleadosPareados.length <= 1}
                        className="field"
                        required
                      >
                        {empleadosPareados.length === 0 && <option value="">No hay empleados disponibles</option>}
                        {empleadosPareados.map((empleado) => <option key={empleado.id} value={empleado.id}>{empleado.nombre}</option>)}
                      </select>
                      <span className="block text-xs text-slate-500">{empleadosPareados.length > 1 ? 'Selecciona quién realizó el lavado.' : empleadosPareados.length === 1 ? 'El único Lavador disponible fue asignado automáticamente.' : 'Se necesita otro empleado Lavador diferente del Aglutinador.'}</span>
                    </label>
                  </div>
                  {!ajusteSopladoRegistrado ? (
                    <label className="block space-y-2">
                      <span className="flex items-center justify-between gap-3 text-sm text-slate-300">
                        Soplado gastado hoy
                        <span className="badge-warning">Una vez por día</span>
                      </span>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          inputMode="decimal"
                          value={sopladoKg}
                          onChange={(event) => setSopladoKg(event.target.value)}
                          className="field pr-12 text-lg font-semibold"
                          aria-describedby="soplado-help"
                        />
                        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">kg</span>
                      </div>
                      <span id="soplado-help" className="block text-xs leading-5 text-slate-500">Se descontará del total diario del Lavador y del Aglutinador. Si hoy no hubo gasto, conserva 0.</span>
                    </label>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                      <Icon name="check" className="h-4 w-4 shrink-0" /> El soplado de hoy ya fue registrado. Puedes corregirlo en Actividad reciente.
                    </div>
                  )}
                  {!procesoPareado && <p role="alert" className="text-xs font-medium text-rose-300">No existe un proceso complementario en el catálogo. Créalo desde Gestión de empleados.</p>}
                  {procesoPareado && empleadosPareados.length === 0 && <p role="alert" className="text-xs font-medium text-amber-300">No hay un empleado activo asignado a {procesoPareado}. Configúralo antes de continuar.</p>}
                </div>
              )}

              <button
                type="submit"
                disabled={saving || !empleadoId || !proceso || materialesDisponibles.length === 0 || (requiereRegistroPareado && (!procesoPareado || !empleadoPareadoId))}
                className="btn-primary mt-1 sm:col-span-2"
              >
                {saving ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Guardando...</> : <><Icon name="plus" className="h-4 w-4" /> Registrar peso</>}
              </button>
            </div>
          </form>

          <aside className="card overflow-hidden">
            <div className="border-b border-slate-800 p-5"><div className="flex items-center justify-between"><h2 className="font-bold text-white">Actividad reciente</h2><span className="badge-success">{registrosProduccion.length} registros</span></div>
            <p className="mt-1 text-xs text-slate-500">Movimientos del empleado seleccionado.</p></div>
            <div className="max-h-[430px] space-y-2 overflow-y-auto p-3">
              {ajusteSopladoRegistrado && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[.07] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-amber-200">Soplado del día</p>
                      <p className="mt-0.5 text-xs text-slate-500">Descuento aplicado a lavado y aglutinado</p>
                    </div>
                    <span className="font-bold text-amber-300">-{Math.abs(ajustesSoplado[0]?.peso_kg ?? 0).toLocaleString('es-CO')} kg</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <input type="number" min="0" step="0.1" inputMode="decimal" value={sopladoKg} onChange={(event) => setSopladoKg(event.target.value)} className="field py-2 pr-10" aria-label="Corregir soplado gastado hoy" />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">kg</span>
                    </div>
                    <button type="button" onClick={() => void handleActualizarSoplado()} disabled={savingSoplado} className="btn-secondary px-3 py-2">
                      {savingSoplado ? 'Guardando…' : 'Corregir'}
                    </button>
                  </div>
                </div>
              )}
              {registrosProduccion.length === 0 ? (
                <div className="py-12 text-center"><Icon name="file" className="mx-auto h-8 w-8 text-slate-700" /><p className="mt-3 text-sm text-slate-500">Aún no hay registros</p></div>
              ) : (
                registrosProduccion.map((registro) => (
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
