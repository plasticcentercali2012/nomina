import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { AppHeader } from '../components/AppHeader';
import { CatalogoMaterial, CatalogoProceso, CierreNominaSemanal, Empleado, NominaHistorica, NominaSemanal, PagoAdicional, Proceso, RegistroDiario, Tarifa, UsuarioSistema } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Icon } from '../components/ui/Icon';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { Toast } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PrinterDialog } from '../components/ui/PrinterDialog';
import { formatLocalDate, parseLocalDate } from '../lib/dateUtils';
import { EscPosReceipt, fitColumns, getSavedPrinter, printEscPos } from '../lib/qzPrinter';
import { empleadoSoloLavador, empleadoTieneEtapa, etapaDelProceso, procesosPrincipalesEmpleado } from '../lib/productionFlow';

const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;
const diasSemanaRecibo = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'] as const;
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
}

function formatReceiptCurrency(value: number) {
  return `$ ${Math.round(value).toLocaleString('es-CO')}`;
}

function formatReceiptDate(value: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })
    .format(parseLocalDate(value));
}

function formatReceiptDayMonth(value: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit' })
    .format(parseLocalDate(value));
}

function formatReceiptDateTime(date: Date) {
  const fecha = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
  const hora = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return `${fecha} ${hora}`;
}

function parseCurrencyInput(value: string) {
  return Number(value.replace(/\D/g, '')) || 0;
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits ? new Intl.NumberFormat('es-CO').format(Number(digits)) : '';
}

function usaResumenTermicoPorDia(proceso: string) {
  const nombreNormalizado = proceso
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return nombreNormalizado === 'lavador'
    || nombreNormalizado === 'lavado'
    || nombreNormalizado === 'aglutinador'
    || nombreNormalizado === 'aglutinado'
    || nombreNormalizado === 'servicio';
}

function esProcesoPicado(proceso: string) {
  const normalizado = proceso.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return normalizado.startsWith('picad');
}

function esEmpleadoDePlanta(empleado: Empleado) {
  const procesosEmpleado = empleado.procesos_asignados.length
    ? empleado.procesos_asignados
    : [empleado.proceso_habitual];

  return procesosEmpleado.some((proceso) => {
    const normalizado = proceso
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
    return normalizado === 'encargada'
      || normalizado === 'encargado'
      || normalizado === 'extrucionador'
      || normalizado === 'extrusionador'
      || normalizado === 'peletizador';
  });
}

function esMaterialSoplado(material: CatalogoMaterial) {
  const nombre = material.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const codigo = material.codigo.trim().toLowerCase();
  return nombre === 'soplado' || codigo === 'soplado';
}

export function AdminDashboardPage() {
  const { profile, loading, signOut, user } = useAuth();
  const navigate = useNavigate();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [catalogoProcesos, setCatalogoProcesos] = useState<CatalogoProceso[]>([]);
  const [catalogoMateriales, setCatalogoMateriales] = useState<CatalogoMaterial[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);
  const [registros, setRegistros] = useState<RegistroDiario[]>([]);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [pagosAdicionales, setPagosAdicionales] = useState<PagoAdicional[]>([]);
  const [nominasSemanales, setNominasSemanales] = useState<NominaSemanal[]>([]);
  const [cierresHistoricos, setCierresHistoricos] = useState<CierreNominaSemanal[]>([]);
  const [nominasHistoricas, setNominasHistoricas] = useState<NominaHistorica[]>([]);
  const [filtroCierreNominaId, setFiltroCierreNominaId] = useState('');
  const [cierresNominaExpandidos, setCierresNominaExpandidos] = useState<Record<string, boolean>>({});
  const [semanaInicio, setSemanaInicio] = useState('');
  const [cargandoSemana, setCargandoSemana] = useState(false);
  const solicitudSemanaActual = useRef(0);
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState('');
  const [selectedWeekDate, setSelectedWeekDate] = useState(formatLocalDate(new Date()));
  const [adminRegistroEmpleadoId, setAdminRegistroEmpleadoId] = useState('');
  const [adminRegistroDate, setAdminRegistroDate] = useState(formatLocalDate(new Date()));
  const [adminRegistroProceso, setAdminRegistroProceso] = useState<RegistroDiario['proceso']>('Picador');
  const [adminRegistroMaterial, setAdminRegistroMaterial] = useState<RegistroDiario['material']>('Poli');
  const [adminRegistroKilos, setAdminRegistroKilos] = useState('');
  const [adminEmpleadoPareadoId, setAdminEmpleadoPareadoId] = useState('');
  const [adminSopladoKg, setAdminSopladoKg] = useState('0');
  const [registrosIngresoLibre, setRegistrosIngresoLibre] = useState<RegistroDiario[]>([]);
  const [registrosIngresoLibreSeleccionados, setRegistrosIngresoLibreSeleccionados] = useState<string[]>([]);
  const [cargandoIngresoLibre, setCargandoIngresoLibre] = useState(false);
  const solicitudIngresoActual = useRef(0);
  const [registroEditValues, setRegistroEditValues] = useState<Record<string, string>>({});
  const [registroProcesoEditValues, setRegistroProcesoEditValues] = useState<Record<string, Proceso>>({});
  const [nuevoEmpleadoNombre, setNuevoEmpleadoNombre] = useState('');
  const [nuevoEmpleadoProcesos, setNuevoEmpleadoProcesos] = useState<Proceso[]>(['Picador']);
  const [nuevoTarifaProceso, setNuevoTarifaProceso] = useState<Tarifa['proceso']>('Picador');
  const [nuevoTarifaMaterial, setNuevoTarifaMaterial] = useState<Tarifa['material']>('Poli');
  const [nuevoTarifaPrecio, setNuevoTarifaPrecio] = useState<number>(0);
  const [nuevoPagoDescripcion, setNuevoPagoDescripcion] = useState('');
  const [nuevoPagoValor, setNuevoPagoValor] = useState('');
  const [pagoEmpleadoId, setPagoEmpleadoId] = useState<string>('');
  const [nuevoPagoFecha, setNuevoPagoFecha] = useState(formatLocalDate(new Date()));
  const [filtroPagoFecha, setFiltroPagoFecha] = useState('');
  const [filtroPagoEmpleado, setFiltroPagoEmpleado] = useState('');
  const [pagoEditValues, setPagoEditValues] = useState<Record<string, { fecha: string; descripcion: string; valor: string }>>({});
  const [loadingAction, setLoadingAction] = useState(false);
  const [activeTab, setActiveTab] = useState<'gestion' | 'tarifas' | 'consolidado' | 'analitica'>('gestion');
  const [periodoAnalitica, setPeriodoAnalitica] = useState<'dia' | 'semana' | 'mes'>('semana');
  const [fechaAnalitica, setFechaAnalitica] = useState(formatLocalDate(new Date()));
  const [registrosAnalitica, setRegistrosAnalitica] = useState<RegistroDiario[]>([]);
  const [cargandoAnalitica, setCargandoAnalitica] = useState(false);
  const [rangoAnaliticaCargado, setRangoAnaliticaCargado] = useState('');
  const [filtroDetalleFecha, setFiltroDetalleFecha] = useState('');
  const [filtroDetalleEmpleado, setFiltroDetalleEmpleado] = useState('');
  const [filtroDetalleProceso, setFiltroDetalleProceso] = useState('');
  const [filtroDetalleMaterial, setFiltroDetalleMaterial] = useState('');
  const [filtroTarifaProceso, setFiltroTarifaProceso] = useState('');
  const [filtroTarifaMaterial, setFiltroTarifaMaterial] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [qzPrinterName, setQzPrinterName] = useState(() => getSavedPrinter());
  const [printingEmployeeId, setPrintingEmployeeId] = useState('');
  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | {
    title: string;
    description: string;
    confirmLabel?: string;
    variant?: 'danger' | 'primary';
    run: () => Promise<void>;
  }>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [nuevoProcesoNombre, setNuevoProcesoNombre] = useState('');
  const [procesoEditValues, setProcesoEditValues] = useState<Record<string, string>>({});
  const [nuevoMaterialCodigo, setNuevoMaterialCodigo] = useState('');
  const [nuevoMaterialNombre, setNuevoMaterialNombre] = useState('');
  const [nuevoMaterialLavado, setNuevoMaterialLavado] = useState(false);
  const [nuevoMaterialAglutinado, setNuevoMaterialAglutinado] = useState(false);
  const [materialEditValues, setMaterialEditValues] = useState<Record<string, string>>({});
  const [empleadosTableExpanded, setEmpleadosTableExpanded] = useState(false);
  const [detalleAnaliticaExpanded, setDetalleAnaliticaExpanded] = useState(false);

  const weekDates = useMemo(() => {
    if (!semanaInicio) return [];
    const start = parseLocalDate(semanaInicio);
    return diasSemana.map((_, index) => {
      const item = new Date(start);
      item.setDate(start.getDate() + index);
      return formatLocalDate(item);
    });
  }, [semanaInicio]);

  const procesos = useMemo(() => catalogoProcesos.map((item) => item.nombre), [catalogoProcesos]);
  const materiales = useMemo(() => catalogoMateriales.map((item) => item.codigo), [catalogoMateriales]);
  const materialDisplayNames = useMemo(
    () => Object.fromEntries(catalogoMateriales.map((item) => [item.codigo, item.nombre])) as Record<string, string>,
    [catalogoMateriales]
  );

  const isAdmin = profile?.rol === 'admin';
  const isGerencial = profile?.rol === 'gerencial';

  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => setNotification(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notification]);

  function notify(type: 'success' | 'error', message: string) {
    setNotification({ type, message });
  }

  async function executeConfirmedAction() {
    if (!confirmAction || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await confirmAction.run();
      setConfirmAction(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  useEffect(() => {
    if (isGerencial && activeTab !== 'consolidado' && activeTab !== 'analitica') {
      setActiveTab('consolidado');
    }
  }, [activeTab, isGerencial]);

  async function handleSignOut() {
    await signOut?.();
    navigate('/login');
  }

  useEffect(() => {
    const monday = new Date();
    const diff = monday.getDay() === 0 ? -6 : 1 - monday.getDay();
    monday.setDate(monday.getDate() + diff);
    setSemanaInicio(formatLocalDate(monday));
  }, []);

  function handleSemanaChange(value: string) {
    if (!value) return;
    const selectedDate = parseLocalDate(value);
    const diff = selectedDate.getDay() === 0 ? -6 : 1 - selectedDate.getDay();
    selectedDate.setDate(selectedDate.getDate() + diff);
    setSemanaInicio(formatLocalDate(selectedDate));
  }

  useEffect(() => {
    supabase
      .from('empleados')
      .select('*, empleado_procesos(proceso)')
      .order('nombre', { ascending: true })
      .then(({ data }) => data && setEmpleados((data as EmpleadoRow[]).map(normalizeEmpleado)));
    supabase.from('procesos').select('nombre').order('nombre').then(({ data }) => {
      if (data) {
        const items = data as CatalogoProceso[];
        setCatalogoProcesos(items);
        setProcesoEditValues(Object.fromEntries(items.map((item) => [item.nombre, item.nombre])));
      }
    });
    supabase.from('materiales').select('codigo,nombre,requiere_lavado,requiere_aglutinado').order('nombre').then(({ data }) => {
      if (data) {
        const items = data as CatalogoMaterial[];
        setCatalogoMateriales(items);
        setMaterialEditValues(Object.fromEntries(items.map((item) => [item.codigo, item.nombre])));
      }
    });
    supabase.from('tarifas').select('*').order('proceso', { ascending: true }).order('material', { ascending: true }).then(({ data }) => data && setTarifas(data as Tarifa[]));
    supabase.from('usuarios_sistema').select('*').order('email', { ascending: true }).then(({ data }) => data && setUsuarios(data as UsuarioSistema[]));
  }, []);

  useEffect(() => {
    if (!semanaInicio) return;

    const numeroSolicitud = ++solicitudSemanaActual.current;
    setCargandoSemana(true);
    setNominasSemanales([]);
    const inicio = parseLocalDate(semanaInicio);
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + diasSemana.length - 1);
    const semanaFin = formatLocalDate(fin);

    async function cargarSemana() {
      const [resultadoRegistros, resultadoPagos, resultadoNominas] = await Promise.all([
        supabase
          .from('registros_diarios')
          .select('*')
          .gte('fecha', semanaInicio)
          .lte('fecha', semanaFin),
        supabase
          .from('pagos_adicionales')
          .select('*')
          .eq('semana_inicio', semanaInicio),
        supabase
          .from('nominas_semanales')
          .select('*')
          .eq('semana_inicio', semanaInicio)
      ]);

      if (numeroSolicitud !== solicitudSemanaActual.current) return;

      const error = resultadoRegistros.error ?? resultadoPagos.error ?? resultadoNominas.error;
      if (error) {
        setRegistros([]);
        setPagosAdicionales([]);
        setNominasSemanales([]);
        setRegistroEditValues({});
        setRegistroProcesoEditValues({});
        notify('error', `No se pudo cargar la semana ${semanaInicio}: ${error.message}`);
        setCargandoSemana(false);
        return;
      }

      const registrosData = (resultadoRegistros.data ?? []) as RegistroDiario[];
      setRegistros(registrosData);
      const pagosData = (resultadoPagos.data ?? []) as PagoAdicional[];
      setPagosAdicionales(pagosData);
      setPagoEditValues(Object.fromEntries(pagosData.map((pago) => [pago.id, {
        fecha: pago.fecha ?? semanaInicio,
        descripcion: pago.descripcion,
        valor: new Intl.NumberFormat('es-CO').format(pago.valor)
      }])));
      setNominasSemanales((resultadoNominas.data ?? []) as NominaSemanal[]);
      setRegistroEditValues(Object.fromEntries(registrosData.map((item) => [item.id, item.peso_kg?.toString() ?? ''])));
      setRegistroProcesoEditValues(Object.fromEntries(registrosData.map((item) => [item.id, item.proceso])));
      setCargandoSemana(false);
    }

    void cargarSemana();
  }, [semanaInicio]);

  useEffect(() => {
    if (!weekDates.length) return;
    const hoy = formatLocalDate(new Date());
    setNuevoPagoFecha(weekDates.includes(hoy) ? hoy : weekDates[0]);
    setFiltroPagoFecha(weekDates.includes(hoy) ? hoy : weekDates[0]);
    setFiltroPagoEmpleado('');
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
    return { inicio: formatLocalDate(inicio), fin: formatLocalDate(fin) };
  }, [fechaAnalitica, periodoAnalitica]);

  useEffect(() => {
    setFiltroDetalleFecha('');
    setFiltroDetalleEmpleado('');
    setFiltroDetalleProceso('');
    setFiltroDetalleMaterial('');
  }, [fechaAnalitica, periodoAnalitica]);

  useEffect(() => {
    if (activeTab !== 'analitica') return;
    const claveRango = `${rangoAnalitica.inicio}:${rangoAnalitica.fin}`;
    if (rangoAnaliticaCargado === claveRango) return;
    setCargandoAnalitica(true);

    async function cargarAnalitica() {
      const [resultadoRegistros, resultadoCierres] = await Promise.all([
        supabase
          .from('registros_diarios')
          .select('*')
          .gte('fecha', rangoAnalitica.inicio)
          .lte('fecha', rangoAnalitica.fin)
          .order('fecha', { ascending: true }),
        supabase
          .from('cierres_nomina_semanal')
          .select('*')
          .lte('semana_inicio', rangoAnalitica.fin)
          .gte('semana_fin', rangoAnalitica.inicio)
          .order('semana_inicio', { ascending: false })
      ]);

      const cierres = (resultadoCierres.data as CierreNominaSemanal[] | null) ?? [];
      let nominas: NominaHistorica[] = [];
      let errorNominas: { message: string } | null = null;

      if (cierres.length) {
        const resultadoNominas = await supabase
          .from('nominas_semanales')
          .select('*, nomina_pago_adicional_detalle(id,fecha,descripcion,valor), nomina_produccion_detalle(id,fecha,proceso,material,material_nombre,peso_kg,precio_unidad,subtotal,es_ajuste_soplado)')
          .in('cierre_id', cierres.map((cierre) => cierre.id))
          .order('empleado_nombre', { ascending: true });
        nominas = (resultadoNominas.data as NominaHistorica[] | null) ?? [];
        errorNominas = resultadoNominas.error;
      }

      const error = resultadoRegistros.error ?? resultadoCierres.error ?? errorNominas;
      if (error) {
        notify('error', `No se pudo cargar toda la analítica: ${error.message}`);
      }

      setRegistrosAnalitica((resultadoRegistros.data as RegistroDiario[]) ?? []);
      setCierresHistoricos(cierres);
      setNominasHistoricas(nominas);
      setFiltroCierreNominaId((actual) => {
        if (actual === 'all' || cierres.some((cierre) => cierre.id === actual)) return actual;
        return cierres[0]?.id ?? '';
      });
      setRangoAnaliticaCargado(claveRango);
      setCargandoAnalitica(false);
    }

    void cargarAnalitica();
  }, [activeTab, rangoAnalitica, rangoAnaliticaCargado]);

  useEffect(() => {
    if (!empleados.length) {
      setSelectedEmpleadoId('');
      setAdminRegistroEmpleadoId('');
      return;
    }
    if (!empleados.some((empleado) => empleado.id === selectedEmpleadoId)) {
      setSelectedEmpleadoId(empleados[0].id);
    }
    if (!empleados.some((empleado) => empleado.id === adminRegistroEmpleadoId)) {
      setAdminRegistroEmpleadoId(empleados[0]?.id ?? '');
    }
  }, [empleados, selectedEmpleadoId, adminRegistroEmpleadoId]);

  useEffect(() => {
    const empleado = empleados.find((item) => item.id === adminRegistroEmpleadoId);
    if (empleado) {
      const principales = procesosPrincipalesEmpleado(empleado);
      const aglutinado = principales.find((item) => etapaDelProceso(item) === 'aglutinado');
      const tieneAmbos = empleadoTieneEtapa(empleado, 'lavado') && empleadoTieneEtapa(empleado, 'aglutinado');
      setAdminRegistroProceso((actual) => tieneAmbos && aglutinado ? aglutinado : principales.includes(actual) ? actual : principales[0] ?? empleado.proceso_habitual);
    }
  }, [adminRegistroEmpleadoId, empleados]);

  useEffect(() => {
    if (!isAdmin || !adminRegistroDate) return;

    setCargandoIngresoLibre(true);
    setRegistrosIngresoLibre([]);
    setRegistrosIngresoLibreSeleccionados([]);
    setAdminSopladoKg('0');
    const numeroSolicitud = ++solicitudIngresoActual.current;
    supabase
      .from('registros_diarios')
      .select('*')
      .eq('fecha', adminRegistroDate)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (numeroSolicitud !== solicitudIngresoActual.current) return;
        if (!error) {
          const items = (data as RegistroDiario[]) ?? [];
          setRegistrosIngresoLibre(items);
          setRegistroEditValues((current) => ({
            ...current,
            ...Object.fromEntries(items.map((item) => [item.id, item.peso_kg?.toString() ?? '']))
          }));
          setRegistroProcesoEditValues((current) => ({
            ...current,
            ...Object.fromEntries(items.map((item) => [item.id, item.proceso]))
          }));
          const ajuste = items.find((item) => item.es_ajuste_soplado);
          setAdminSopladoKg(ajuste ? Math.abs(ajuste.peso_kg ?? 0).toString() : '0');
        } else {
          notify('error', `No se pudieron cargar los registros de la fecha: ${error.message}`);
        }
        setCargandoIngresoLibre(false);
      });
  }, [adminRegistroDate, isAdmin]);

  const adminEtapaActual = etapaDelProceso(adminRegistroProceso);
  const adminEmpleadoSeleccionado = empleados.find((item) => item.id === adminRegistroEmpleadoId);
  const adminProcesosDisponibles = adminEmpleadoSeleccionado
    ? (adminEmpleadoSeleccionado.procesos_asignados.length
        ? adminEmpleadoSeleccionado.procesos_asignados
        : [adminEmpleadoSeleccionado.proceso_habitual])
    : procesos;
  const adminMaterialSeleccionado = catalogoMateriales.find((item) => item.codigo === adminRegistroMaterial);
  const codigoSoplado = catalogoMateriales.find(esMaterialSoplado)?.codigo ?? '';
  const adminMaterialesDisponibles = useMemo(() => catalogoMateriales.filter((item) => {
    if (esMaterialSoplado(item)) return false;
    if (adminEtapaActual === 'lavado') return item.requiere_lavado;
    if (adminEtapaActual === 'aglutinado') return item.requiere_aglutinado;
    return true;
  }), [adminEtapaActual, catalogoMateriales]);
  const adminRequierePareado = Boolean(
    adminEtapaActual
    && adminMaterialSeleccionado?.requiere_lavado
    && adminMaterialSeleccionado?.requiere_aglutinado
  );
  const adminEtapaPareada = adminEtapaActual === 'lavado' ? 'aglutinado' : adminEtapaActual === 'aglutinado' ? 'lavado' : null;
  const adminProcesoPareado = catalogoProcesos.find((item) => etapaDelProceso(item.nombre) === adminEtapaPareada)?.nombre ?? '';
  const adminEmpleadosPareados = useMemo(
    () => empleados.filter((empleado) =>
      empleado.id !== adminRegistroEmpleadoId
      && empleado.activo
      && Boolean(adminEtapaPareada)
      && empleadoTieneEtapa(empleado, adminEtapaPareada!)
    ),
    [adminEtapaPareada, adminRegistroEmpleadoId, empleados]
  );
  const ajustesSopladoAdmin = useMemo(
    () => registrosIngresoLibre.filter((item) => item.es_ajuste_soplado),
    [registrosIngresoLibre]
  );
  const adminAjusteSopladoRegistrado = ajustesSopladoAdmin.length > 0;

  useEffect(() => {
    const codigos = adminMaterialesDisponibles.map((item) => item.codigo);
    if (codigos.length && !codigos.includes(adminRegistroMaterial)) setAdminRegistroMaterial(codigos[0]);
  }, [adminMaterialesDisponibles, adminRegistroMaterial]);

  useEffect(() => {
    if (!adminRequierePareado) {
      setAdminEmpleadoPareadoId('');
      return;
    }
    setAdminEmpleadoPareadoId(adminEmpleadosPareados[0]?.id ?? '');
  }, [adminEmpleadosPareados, adminRequierePareado]);

  const registrosPorEmpleadoYDia = useMemo(() => {
    if (!selectedEmpleadoId || !selectedWeekDate) return [];
    return registros.filter(
      (item) => item.empleado_id === selectedEmpleadoId && item.fecha === selectedWeekDate
    );
  }, [registros, selectedEmpleadoId, selectedWeekDate]);

  const registrosIngresoLibreFiltrados = useMemo(
    () => registrosIngresoLibre.filter((registro) =>
      registro.fecha === adminRegistroDate
      && registro.empleado_id === adminRegistroEmpleadoId
      && registro.proceso === adminRegistroProceso
      && registro.material === adminRegistroMaterial
    ),
    [
      adminRegistroDate,
      adminRegistroEmpleadoId,
      adminRegistroMaterial,
      adminRegistroProceso,
      registrosIngresoLibre
    ]
  );
  const idsRegistrosIngresoLibreVisibles = useMemo(
    () => registrosIngresoLibreFiltrados.map((registro) => registro.id),
    [registrosIngresoLibreFiltrados]
  );
  const todosRegistrosIngresoLibreSeleccionados = idsRegistrosIngresoLibreVisibles.length > 0
    && idsRegistrosIngresoLibreVisibles.every((id) => registrosIngresoLibreSeleccionados.includes(id));

  useEffect(() => {
    setRegistrosIngresoLibreSeleccionados((actuales) =>
      actuales.filter((id) => idsRegistrosIngresoLibreVisibles.includes(id))
    );
  }, [idsRegistrosIngresoLibreVisibles]);

  const selectedEmpleadoName = useMemo(
    () => empleados.find((item) => item.id === selectedEmpleadoId)?.nombre ?? '',
    [empleados, selectedEmpleadoId]
  );

  async function handleAdminCrearRegistro() {
    if (nominaSemanaPagada && weekDates.includes(adminRegistroDate)) {
      notify('error', 'La nómina de esta semana ya fue pagada y no admite nuevos registros.');
      return;
    }
    if (!adminRegistroEmpleadoId || !adminRegistroKilos) {
      notify('error', 'Selecciona un empleado e ingresa los kilos antes de registrar.');
      return;
    }
    const kilos = Number(adminRegistroKilos);
    if (!Number.isFinite(kilos) || kilos <= 0) {
      notify('error', 'Ingresa una cantidad de kilos mayor que cero.');
      return;
    }
    if (adminRequierePareado && (!adminProcesoPareado || !adminEmpleadoPareadoId)) {
      notify('error', 'Selecciona el empleado del proceso complementario.');
      return;
    }
    if (adminRequierePareado && adminEmpleadoPareadoId === adminRegistroEmpleadoId) {
      notify('error', 'El Aglutinador y el Lavador deben ser empleados diferentes.');
      return;
    }

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

    const registrosNuevos: Array<Omit<RegistroDiario, 'id'>> = adminRequierePareado
      ? [newRecord, { ...newRecord, empleado_id: adminEmpleadoPareadoId, proceso: adminProcesoPareado }]
      : [newRecord];

    const { data, error } = await supabase
      .from('registros_diarios')
      .insert(registrosNuevos)
      .select();
    if (!error && data) {
      const creados = data as RegistroDiario[];
      setRegistrosIngresoLibre((current) => [...creados, ...current]);
      const creadosSemana = creados.filter((item) => weekDates.includes(item.fecha));
      if (creadosSemana.length) setRegistros((current) => [...current, ...creadosSemana]);
      const creadosAnalitica = creados.filter((item) => item.fecha >= rangoAnalitica.inicio && item.fecha <= rangoAnalitica.fin);
      if (creadosAnalitica.length) setRegistrosAnalitica((current) => [...current, ...creadosAnalitica]);
      setRegistroEditValues((current) => ({ ...current, ...Object.fromEntries(creados.map((item) => [item.id, item.peso_kg?.toString() ?? ''])) }));
      setRegistroProcesoEditValues((current) => ({ ...current, ...Object.fromEntries(creados.map((item) => [item.id, item.proceso])) }));
      setAdminRegistroKilos('');
      notify('success', adminRequierePareado ? 'Los kilos de lavado y aglutinado fueron registrados.' : 'El registro de kilos fue creado y los consolidados se actualizaron.');
    } else {
      notify('error', `No se pudo crear el registro: ${error?.message ?? 'error desconocido'}`);
    }
    setLoadingAction(false);
  }

  async function handleAdminActualizarSoplado() {
    if (nominaSemanaPagada && weekDates.includes(adminRegistroDate)) {
      notify('error', 'La nómina de esta semana ya fue pagada y el soplado quedó cerrado.');
      return;
    }
    const cantidad = Number(adminSopladoKg || 0);
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      notify('error', 'El soplado debe ser un número igual o mayor que cero.');
      return;
    }
    if (!adminAjusteSopladoRegistrado && (!adminRequierePareado || !adminProcesoPareado || !adminEmpleadoPareadoId)) {
      notify('error', 'Selecciona los empleados de lavado y aglutinado antes de crear el soplado.');
      return;
    }
    if (!adminAjusteSopladoRegistrado && !codigoSoplado) {
      notify('error', 'No se encontró el material interno Soplado. Aplica la migración antes de guardarlo.');
      return;
    }
    setLoadingAction(true);
    const baseSoplado = {
      empleado_id: adminRegistroEmpleadoId,
      fecha: adminRegistroDate,
      proceso: adminRegistroProceso,
      material: codigoSoplado,
      material_referencia: adminRegistroMaterial,
      peso_kg: -cantidad,
      cantidad_bultos: null,
      creado_por: profile?.id ?? '',
      es_ajuste_soplado: true
    };
    const resultado = adminAjusteSopladoRegistrado
      ? await supabase
        .from('registros_diarios')
        .update({ peso_kg: -cantidad })
        .eq('fecha', adminRegistroDate)
        .eq('es_ajuste_soplado', true)
        .select()
      : await supabase
        .from('registros_diarios')
        .insert([
          baseSoplado,
          { ...baseSoplado, empleado_id: adminEmpleadoPareadoId, proceso: adminProcesoPareado }
        ])
        .select();
    const { data, error } = resultado;
    if (!error && data) {
      const actualizados = data as RegistroDiario[];
      const reemplazar = (items: RegistroDiario[]) => items.map((item) => actualizados.find((ajuste) => ajuste.id === item.id) ?? item);
      if (adminAjusteSopladoRegistrado) {
        setRegistrosIngresoLibre(reemplazar);
        setRegistros(reemplazar);
        setRegistrosAnalitica(reemplazar);
      } else {
        setRegistrosIngresoLibre((current) => [...actualizados, ...current]);
        if (weekDates.includes(adminRegistroDate)) setRegistros((current) => [...current, ...actualizados]);
        if (adminRegistroDate >= rangoAnalitica.inicio && adminRegistroDate <= rangoAnalitica.fin) {
          setRegistrosAnalitica((current) => [...current, ...actualizados]);
        }
      }
      setRegistroEditValues((current) => ({ ...current, ...Object.fromEntries(actualizados.map((item) => [item.id, item.peso_kg?.toString() ?? ''])) }));
      notify('success', `Soplado guardado en ${cantidad.toLocaleString('es-CO')} kg para ${adminRegistroDate}.`);
    } else {
      notify('error', `No se pudo actualizar el soplado: ${error?.message ?? 'error desconocido'}`);
    }
    setLoadingAction(false);
  }

  const registrosAnaliticaFiltrados = useMemo(
    () => registrosAnalitica.filter((registro) =>
      (!filtroDetalleFecha || registro.fecha === filtroDetalleFecha)
      && (!filtroDetalleEmpleado || registro.empleado_id === filtroDetalleEmpleado)
      && (!filtroDetalleProceso || registro.proceso === filtroDetalleProceso)
      && (!filtroDetalleMaterial || registro.material === filtroDetalleMaterial)
    ),
    [
      filtroDetalleEmpleado,
      filtroDetalleFecha,
      filtroDetalleMaterial,
      filtroDetalleProceso,
      registrosAnalitica
    ]
  );

  const estadisticas = useMemo(() => {
    const registrosPicado = registrosAnaliticaFiltrados.filter((registro) => esProcesoPicado(registro.proceso));
    const registrosAglutinado = registrosAnaliticaFiltrados.filter((registro) => etapaDelProceso(registro.proceso) === 'aglutinado');
    const registrosParaSumatorias = filtroDetalleProceso ? registrosAnaliticaFiltrados : registrosAglutinado;
    return {
      procesos: registrosAnaliticaFiltrados.reduce<Record<string, number>>((acc, registro) => {
        acc[registro.proceso] = (acc[registro.proceso] ?? 0) + (registro.peso_kg ?? 0);
        return acc;
      }, {}),
      materialesPicado: registrosPicado.reduce<Record<string, number>>((acc, registro) => {
        acc[registro.material] = (acc[registro.material] ?? 0) + (registro.peso_kg ?? 0);
        return acc;
      }, {}),
      materialesAglutinado: registrosAglutinado.reduce<Record<string, number>>((acc, registro) => {
        acc[registro.material] = (acc[registro.material] ?? 0) + (registro.peso_kg ?? 0);
        return acc;
      }, {}),
      totalFinalKg: registrosParaSumatorias.reduce((total, registro) => total + (registro.peso_kg ?? 0), 0),
      totalEmpleadosPeriodo: new Set(registrosAnaliticaFiltrados.map((registro) => registro.empleado_id)).size,
      totalSalidasFinales: registrosAnaliticaFiltrados.filter((registro) => etapaDelProceso(registro.proceso) === 'aglutinado').length
    };
  }, [filtroDetalleProceso, registrosAnaliticaFiltrados]);

  const totalDetalleAnalitica = useMemo(() => {
    const registrosParaTotal = filtroDetalleProceso
      ? registrosAnaliticaFiltrados
      : registrosAnaliticaFiltrados.filter((registro) => etapaDelProceso(registro.proceso) === 'aglutinado');
    return registrosParaTotal.reduce((total, registro) => total + (registro.peso_kg ?? 0), 0);
  }, [filtroDetalleProceso, registrosAnaliticaFiltrados]);
  const cantidadFiltrosAnalitica = [filtroDetalleFecha, filtroDetalleEmpleado, filtroDetalleProceso, filtroDetalleMaterial].filter(Boolean).length;

  const cierresHistoricosVisibles = useMemo(
    () => filtroCierreNominaId === 'all'
      ? cierresHistoricos
      : cierresHistoricos.filter((cierre) => cierre.id === filtroCierreNominaId),
    [cierresHistoricos, filtroCierreNominaId]
  );

  const tarifasFiltradas = useMemo(
    () => tarifas.filter((tarifa) =>
      (!filtroTarifaProceso || tarifa.proceso === filtroTarifaProceso)
      && (!filtroTarifaMaterial || tarifa.material === filtroTarifaMaterial)
    ),
    [filtroTarifaMaterial, filtroTarifaProceso, tarifas]
  );

  function limpiarFiltrosDetalle() {
    setFiltroDetalleFecha('');
    setFiltroDetalleEmpleado('');
    setFiltroDetalleProceso('');
    setFiltroDetalleMaterial('');
  }

  const resumenPorProcesoSemana = useMemo(
    () => procesos.flatMap((proceso) =>
      [{
        proceso,
        materiales: materiales.map((material) => {
        const kilosPorDia = weekDates.map((fecha) =>
          registros
            .filter(
              (registro) =>
                registro.fecha === fecha
                && registro.proceso === proceso
                && registro.material === material
            )
            .reduce((total, registro) => total + (registro.peso_kg ?? 0), 0)
        );
        const totalKilos = kilosPorDia.reduce((total, kilos) => total + kilos, 0);

        return {
          material,
          kilosPorDia,
          totalKilos,
          totalPagar: registros
            .filter((registro) => weekDates.includes(registro.fecha) && registro.proceso === proceso && registro.material === material)
            .reduce((total, registro) => total + ((registro.peso_kg ?? 0) * getTarifaRegistro(registro)), 0)
        };
        }),
        totalesPorDia: weekDates.map((fecha) =>
          registros
            .filter((registro) => registro.fecha === fecha && registro.proceso === proceso)
            .reduce((total, registro) => total + (registro.peso_kg ?? 0), 0)
        ),
        totalKilos: registros
          .filter((registro) => weekDates.includes(registro.fecha) && registro.proceso === proceso)
          .reduce((total, registro) => total + (registro.peso_kg ?? 0), 0),
        totalPagar: registros
          .filter((registro) => weekDates.includes(registro.fecha) && registro.proceso === proceso)
          .reduce(
            (total, registro) =>
              total + ((registro.peso_kg ?? 0) * getTarifaRegistro(registro)),
            0
          )
      }]
    ),
    [materiales, procesos, registros, tarifas, weekDates]
  );

  const resumenProcesoMaterialSemana = useMemo(
    () => resumenPorProcesoSemana.flatMap((resumen) =>
      resumen.materiales.map((item) => ({ ...item, proceso: resumen.proceso }))
    ),
    [resumenPorProcesoSemana]
  );

  const totalKilosSemana = useMemo(
    () => empleados.reduce((total, empleado) => total + getResumenNominaEmpleado(empleado).totalKg, 0),
    [empleados, registros, weekDates]
  );

  const totalPagosAdicionalesSemana = useMemo(
    () => pagosAdicionales.reduce((total, pago) => total + pago.valor, 0),
    [pagosAdicionales]
  );

  const pagosAdicionalesFiltrados = useMemo(
    () => pagosAdicionales.filter((pago) =>
      (!filtroPagoFecha || pago.fecha === filtroPagoFecha)
      && (!filtroPagoEmpleado || pago.empleado_id === filtroPagoEmpleado)
    ),
    [filtroPagoEmpleado, filtroPagoFecha, pagosAdicionales]
  );

  const totalAPagarSemana = useMemo(
    () => empleados.reduce((total, empleado) => total + getResumenNominaEmpleado(empleado).totalPagar, 0),
    [empleados, pagosAdicionales, registros, tarifas, weekDates]
  );

  const nominaSemanaPagada = nominasSemanales.some(
    (nomina) => nomina.estado === 'pagada' && Boolean(nomina.cierre_id)
  );
  const semanaNominaNoEditable = cargandoSemana || nominaSemanaPagada;

  function getDetallesDelDia(empleadoId: string, fecha: string) {
    return registros
      .filter((item) => item.empleado_id === empleadoId && item.fecha === fecha)
      .map((item) => `${item.proceso} ${materialDisplayNames[item.material]} ${item.peso_kg?.toFixed(0) ?? 0} kg`);
  }

  async function imprimirComprobanteNativo(empleado: Empleado) {
    if (printingEmployeeId) return;
    setPrintingEmployeeId(empleado.id);
    try {
      const registrosEmpleado = registros
        .filter((item) => item.empleado_id === empleado.id && weekDates.includes(item.fecha))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
      const totalKg = registrosEmpleado.reduce((sum, item) => sum + (item.peso_kg ?? 0), 0);
      const subtotalProduccion = registrosEmpleado.reduce(
        (sum, item) => sum + ((item.peso_kg ?? 0) * getTarifaRegistro(item)),
        0
      );
      const pagoAdicional = getPagoAdicional(empleado.id);
      const pagosAdicionalesEmpleado = pagosAdicionales
        .filter((pago) => pago.empleado_id === empleado.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const totalPagar = subtotalProduccion + pagoAdicional;
      const esEmpleadoPlanta = esEmpleadoDePlanta(empleado);
      const receipt = new EscPosReceipt();

      receipt
        .align(1)
        .bold(true)
        .line('COMPROBANTE DE PAGO')
        .bold(false)
        .wrapped(empleado.nombre)
        .align(0)
        .separator()
        .line(fitColumns('Semana', `${formatReceiptDayMonth(weekDates[0] ?? '')}-${formatReceiptDate(weekDates[weekDates.length - 1] ?? '')}`))
        .line(fitColumns('Emitido', formatReceiptDateTime(new Date())))
        .separator();

      if (!esEmpleadoPlanta) {
        weekDates.forEach((fecha, index) => {
          const items = registrosEmpleado.filter((item) => item.fecha === fecha);
          const totalDiaKg = items.reduce((sum, item) => sum + (item.peso_kg ?? 0), 0);
          const totalDiaPago = items.reduce((sum, item) => sum + ((item.peso_kg ?? 0) * getTarifaRegistro(item)), 0);
          const mostrarSoloResumen = items.some((item) => usaResumenTermicoPorDia(item.proceso));

          receipt.bold(true).line(fitColumns(diasSemanaRecibo[index], formatReceiptDate(fecha))).bold(false);
          if (!items.length) {
            receipt.line('Sin registros');
          } else if (!mostrarSoloResumen) {
            items.forEach((item) => {
              const kilos = item.peso_kg ?? 0;
              const precio = getTarifaRegistro(item);
              receipt
                .wrapped(`${item.proceso} - ${materialDisplayNames[item.material] ?? item.material}`)
                .line(fitColumns(`${kilos.toLocaleString('es-CO')}kg x ${formatReceiptCurrency(precio)}`, formatReceiptCurrency(kilos * precio)));
            });
          }
          receipt
            .bold(true)
            .line(fitColumns(`Total día: ${totalDiaKg.toLocaleString('es-CO')}kg`, formatReceiptCurrency(totalDiaPago)))
            .bold(false)
            .separator();
        });

        receipt
          .line(fitColumns('Total kilos', `${totalKg.toLocaleString('es-CO')} kg`))
          .line(fitColumns('Producción', formatReceiptCurrency(subtotalProduccion)));
      }

      receipt.bold(true).line('PAGOS ADICIONALES').bold(false);
      if (pagosAdicionalesEmpleado.length) {
        pagosAdicionalesEmpleado.forEach((pago) => {
          receipt
            .wrapped(pago.descripcion)
            .line(fitColumns('Valor', formatReceiptCurrency(pago.valor)));
        });
      } else {
        receipt.line(fitColumns('Sin pagos adicionales', formatReceiptCurrency(0)));
      }

      receipt
        .separator('=')
        .bold(true)
        .line(fitColumns('TOTAL A PAGAR', formatReceiptCurrency(totalPagar)))
        .separator('=')
        .bold(false)
        .align(1)
        .line('Comprobante informativo')
        .line('de nómina');

      const printer = await printEscPos(receipt.finish(), `Nómina - ${empleado.nombre}`);
      setQzPrinterName(printer);
      notify('success', `Comprobante enviado a ${printer}.`);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'No se pudo imprimir el comprobante.');
    } finally {
      setPrintingEmployeeId('');
    }
  }

  async function handleActualizarTarifa(id: string, precioUnificado: number) {
    setLoadingAction(true);
    const { error } = await supabase.from('tarifas').update({ precio_unidad: precioUnificado }).eq('id', id);
    if (!error) {
      setTarifas((current) => current.map((tarifa) => (tarifa.id === id ? { ...tarifa, precio_unidad: precioUnificado } : tarifa)));
      notify('success', 'La tarifa fue actualizada en todos los consolidados.');
    } else {
      notify('error', `No se pudo actualizar la tarifa: ${error.message}`);
    }
    setLoadingAction(false);
  }

  async function handleCrearTarifa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nuevoTarifaProceso || !nuevoTarifaMaterial || nuevoTarifaPrecio <= 0) return;

    setLoadingAction(true);
    const { data, error } = await supabase
      .from('tarifas')
      .insert([{ proceso: nuevoTarifaProceso, material: nuevoTarifaMaterial, precio_unidad: nuevoTarifaPrecio }])
      .select()
      .single();
    if (!error && data) {
      setTarifas((current) => [...current, data as Tarifa]);
      setNuevoTarifaProceso('Picador');
      setNuevoTarifaMaterial('Poli');
      setNuevoTarifaPrecio(0);
      notify('success', 'La tarifa fue creada correctamente.');
    } else {
      notify('error', `No se pudo crear la tarifa: ${error?.message ?? 'error desconocido'}`);
    }
    setLoadingAction(false);
  }

  async function handleEliminarTarifa(id: string) {
    const { error } = await supabase.from('tarifas').delete().eq('id', id);
    if (!error) {
      setTarifas((current) => current.filter((tarifa) => tarifa.id !== id));
      notify('success', 'La tarifa fue eliminada.');
    } else {
      notify('error', `No se pudo eliminar la tarifa: ${error.message}`);
    }
  }

  async function handleCrearEmpleado(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nuevoEmpleadoNombre.trim() || !nuevoEmpleadoProcesos.length) {
      notify('error', 'Ingresa el nombre y selecciona al menos un proceso.');
      return;
    }

    setLoadingAction(true);
    const { data, error } = await supabase
      .from('empleados')
      .insert([{
        nombre: nuevoEmpleadoNombre.trim(),
        proceso_habitual: nuevoEmpleadoProcesos[0],
        activo: true
      }])
      .select()
      .single();
    if (!error && data) {
      const { error: procesosError } = await supabase
        .from('empleado_procesos')
        .insert(nuevoEmpleadoProcesos.map((proceso) => ({ empleado_id: data.id, proceso })));
      if (!procesosError) {
        setEmpleados((current) => [
          ...current,
          normalizeEmpleado({
            ...(data as Omit<Empleado, 'procesos_asignados'>),
            empleado_procesos: nuevoEmpleadoProcesos.map((proceso) => ({ proceso }))
          })
        ]);
        setNuevoEmpleadoNombre('');
        setNuevoEmpleadoProcesos(['Picador']);
        notify('success', 'El empleado fue creado con sus procesos asignados.');
      } else {
        await supabase.from('empleados').delete().eq('id', data.id);
        notify('error', `No se pudieron asignar los procesos: ${procesosError.message}`);
      }
    } else {
      notify('error', `No se pudo crear el empleado: ${error?.message ?? 'error desconocido'}`);
    }
    setLoadingAction(false);
  }

  async function handleCrearPagoAdicional(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nominaSemanaPagada) {
      notify('error', 'La nómina ya fue pagada y no admite pagos adicionales nuevos.');
      return;
    }
    const valorPago = parseCurrencyInput(nuevoPagoValor);
    if (!pagoEmpleadoId || !nuevoPagoFecha || !nuevoPagoDescripcion.trim() || valorPago <= 0) {
      notify('error', 'Selecciona fecha, empleado, concepto e ingresa un valor mayor que cero.');
      return;
    }
    if (!weekDates.includes(nuevoPagoFecha)) {
      notify('error', 'La fecha del pago adicional debe pertenecer a la semana seleccionada.');
      return;
    }

    setLoadingAction(true);
    const { data, error } = await supabase
      .from('pagos_adicionales')
      .insert([{ empleado_id: pagoEmpleadoId, semana_inicio: weekDates[0], fecha: nuevoPagoFecha, descripcion: nuevoPagoDescripcion.trim(), valor: valorPago }])
      .select()
      .single();
    if (!error && data) {
      const creado = data as PagoAdicional;
      setPagosAdicionales((current) => [...current, creado]);
      setPagoEditValues((current) => ({ ...current, [creado.id]: { fecha: creado.fecha, descripcion: creado.descripcion, valor: formatCurrencyInput(String(creado.valor)) } }));
      setNuevoPagoDescripcion('');
      setNuevoPagoValor('');
      setPagoEmpleadoId('');
      notify('success', 'El pago adicional fue agregado y los totales se actualizaron.');
    } else {
      notify('error', `No se pudo agregar el pago: ${error?.message ?? 'error desconocido'}`);
    }
    setLoadingAction(false);
  }

  async function handleGuardarNominaSemanal() {
    if (!weekDates.length) return;

    setLoadingAction(true);
    const { error } = await supabase.rpc('cerrar_nomina_semanal', {
      p_semana_inicio: weekDates[0]
    });
    if (!error) {
      const resultadoNominas = await supabase
        .from('nominas_semanales')
        .select('*')
        .eq('semana_inicio', weekDates[0])
        .order('empleado_nombre', { ascending: true });
      if (resultadoNominas.error) {
        notify('error', `La nómina fue pagada, pero no se pudo recargar el histórico: ${resultadoNominas.error.message}`);
      } else {
        setNominasSemanales((resultadoNominas.data as NominaSemanal[]) ?? []);
        setRangoAnaliticaCargado('');
        notify('success', 'La nómina fue pagada y guardada completa en el histórico.');
      }
    } else {
      notify('error', `No se pudo pagar la nómina: ${error.message}`);
    }
    setLoadingAction(false);
  }

  async function handleEliminarPagoAdicional(id: string) {
    if (nominaSemanaPagada) {
      notify('error', 'No se puede eliminar un concepto de una nómina pagada.');
      return;
    }
    const { error } = await supabase.from('pagos_adicionales').delete().eq('id', id);
    if (!error) {
      setPagosAdicionales((current) => current.filter((pago) => pago.id !== id));
      setPagoEditValues((current) => {
        const siguiente = { ...current };
        delete siguiente[id];
        return siguiente;
      });
      notify('success', 'El pago adicional fue eliminado y los totales se actualizaron.');
    } else {
      notify('error', `No se pudo eliminar el pago: ${error.message}`);
    }
  }

  async function handleActualizarPagoAdicional(id: string) {
    if (nominaSemanaPagada) {
      notify('error', 'No se puede editar un concepto de una nómina pagada.');
      return;
    }
    const values = pagoEditValues[id];
    const valor = parseCurrencyInput(values?.valor ?? '');
    if (!values?.fecha || !values.descripcion.trim() || valor <= 0) {
      notify('error', 'Completa la fecha, el concepto y un valor mayor que cero.');
      return;
    }
    if (!weekDates.includes(values.fecha)) {
      notify('error', 'La fecha debe permanecer dentro de la semana seleccionada.');
      return;
    }

    setLoadingAction(true);
    const { data, error } = await supabase
      .from('pagos_adicionales')
      .update({ fecha: values.fecha, descripcion: values.descripcion.trim(), valor })
      .eq('id', id)
      .eq('semana_inicio', weekDates[0])
      .select()
      .single();
    if (!error && data) {
      const actualizado = data as PagoAdicional;
      setPagosAdicionales((current) => current.map((pago) => pago.id === id ? actualizado : pago));
      setPagoEditValues((current) => ({ ...current, [id]: { fecha: actualizado.fecha, descripcion: actualizado.descripcion, valor: formatCurrencyInput(String(actualizado.valor)) } }));
      notify('success', 'El pago adicional fue actualizado.');
    } else {
      notify('error', `No se pudo actualizar el pago adicional: ${error?.message ?? 'error desconocido'}`);
    }
    setLoadingAction(false);
  }

  async function handleActualizarRegistroDiario(id: string) {
    const value = registroEditValues[id];
    const nuevoProceso = registroProcesoEditValues[id];
    if (!value) return;
    const nuevoPeso = Number(value);
    if (Number.isNaN(nuevoPeso) || nuevoPeso < 0 || !nuevoProceso) return;

    setLoadingAction(true);
    const { data, error } = await supabase
      .from('registros_diarios')
      .update({ peso_kg: nuevoPeso, proceso: nuevoProceso })
      .eq('id', id)
      .select()
      .single();
    if (!error && data) {
      const registroActualizado = data as RegistroDiario;
      setRegistros((current) => current.map((item) => (item.id === id ? registroActualizado : item)));
      setRegistrosAnalitica((current) =>
        current.map((item) => (item.id === id ? registroActualizado : item))
      );
      setRegistrosIngresoLibre((current) =>
        current.map((item) => (item.id === id ? registroActualizado : item))
      );
      setRegistroEditValues((current) => ({ ...current, [id]: nuevoPeso.toString() }));
      setRegistroProcesoEditValues((current) => ({ ...current, [id]: nuevoProceso }));
      notify('success', 'El registro fue actualizado en todas las vistas.');
    } else {
      notify('error', `No se pudo actualizar el registro: ${error?.message ?? 'error desconocido'}`);
    }
    setLoadingAction(false);
  }

  async function handleEliminarRegistroDiario(id: string) {
    setLoadingAction(true);
    const { error } = await supabase.from('registros_diarios').delete().eq('id', id);
    if (!error) {
      setRegistros((current) => current.filter((item) => item.id !== id));
      setRegistrosAnalitica((current) => current.filter((item) => item.id !== id));
      setRegistrosIngresoLibre((current) => current.filter((item) => item.id !== id));
      setRegistrosIngresoLibreSeleccionados((current) => current.filter((itemId) => itemId !== id));
      setRegistroEditValues((current) => {
        const siguiente = { ...current };
        delete siguiente[id];
        return siguiente;
      });
      setRegistroProcesoEditValues((current) => {
        const siguiente = { ...current };
        delete siguiente[id];
        return siguiente;
      });
      notify('success', 'El registro fue eliminado de todas las vistas.');
    } else {
      notify('error', `No se pudo eliminar el registro: ${error.message}`);
    }
    setLoadingAction(false);
  }

  async function handleEliminarRegistrosDiarios(ids: string[]) {
    const idsUnicos = [...new Set(ids)];
    if (!idsUnicos.length) return;

    setLoadingAction(true);
    const { error } = await supabase.from('registros_diarios').delete().in('id', idsUnicos);
    if (!error) {
      const idsEliminados = new Set(idsUnicos);
      setRegistros((current) => current.filter((item) => !idsEliminados.has(item.id)));
      setRegistrosAnalitica((current) => current.filter((item) => !idsEliminados.has(item.id)));
      setRegistrosIngresoLibre((current) => current.filter((item) => !idsEliminados.has(item.id)));
      setRegistrosIngresoLibreSeleccionados([]);
      setRegistroEditValues((current) => Object.fromEntries(
        Object.entries(current).filter(([id]) => !idsEliminados.has(id))
      ));
      setRegistroProcesoEditValues((current) => Object.fromEntries(
        Object.entries(current).filter(([id]) => !idsEliminados.has(id))
      ));
      notify('success', `${idsUnicos.length} registro(s) fueron eliminados de todas las vistas.`);
    } else {
      notify('error', `No se pudieron eliminar los registros: ${error.message}`);
    }
    setLoadingAction(false);
  }

  async function handleToggleActivo(empleado: Empleado) {
    const { data, error } = await supabase
      .from('empleados')
      .update({ activo: !empleado.activo })
      .eq('id', empleado.id)
      .select()
      .single();
    if (!error && data) {
      const actualizado = { ...(data as Omit<Empleado, 'procesos_asignados'>), procesos_asignados: empleado.procesos_asignados };
      setEmpleados((current) => current.map((item) => (item.id === empleado.id ? actualizado : item)));
      notify('success', `El empleado fue marcado como ${actualizado.activo ? 'activo' : 'inactivo'}.`);
    } else {
      notify('error', `No se pudo cambiar el estado del empleado: ${error?.message ?? 'error desconocido'}`);
    }
  }

  async function handleActualizarEmpleado(empleado: Empleado) {
    if (!empleado.procesos_asignados.length) {
      notify('error', 'El empleado debe tener al menos un proceso asignado.');
      return;
    }

    setLoadingAction(true);
    const { data, error } = await supabase
      .from('empleados')
      .update({
        nombre: empleado.nombre,
        proceso_habitual: empleado.procesos_asignados[0],
        activo: empleado.activo
      })
      .eq('id', empleado.id)
      .select()
      .single();
    if (!error && data) {
      const { error: upsertError } = await supabase
        .from('empleado_procesos')
        .upsert(
          empleado.procesos_asignados.map((proceso) => ({ empleado_id: empleado.id, proceso })),
          { onConflict: 'empleado_id,proceso' }
        );
      const procesosEliminados = procesos.filter((proceso) => !empleado.procesos_asignados.includes(proceso));
      const { error: deleteError } = procesosEliminados.length
        ? await supabase
          .from('empleado_procesos')
          .delete()
          .eq('empleado_id', empleado.id)
          .in('proceso', procesosEliminados)
        : { error: null };

      if (!upsertError && !deleteError) {
        const actualizado: Empleado = {
          ...(data as Omit<Empleado, 'procesos_asignados'>),
          procesos_asignados: empleado.procesos_asignados
        };
        setEmpleados((current) => current.map((item) => (item.id === empleado.id ? actualizado : item)));
        notify('success', 'El empleado y sus procesos fueron actualizados.');
      } else {
        notify('error', `No se pudieron actualizar los procesos: ${(upsertError ?? deleteError)?.message}`);
      }
    } else {
      notify('error', `No se pudo actualizar el empleado: ${error?.message ?? 'error desconocido'}`);
    }
    setLoadingAction(false);
  }

  async function handleEliminarEmpleado(id: string) {
    const { error } = await supabase.from('empleados').delete().eq('id', id);
    if (!error) {
      setEmpleados((current) => current.filter((item) => item.id !== id));
      setRegistros((current) => current.filter((item) => item.empleado_id !== id));
      setRegistrosAnalitica((current) => current.filter((item) => item.empleado_id !== id));
      setRegistrosIngresoLibre((current) => current.filter((item) => item.empleado_id !== id));
      setPagosAdicionales((current) => current.filter((item) => item.empleado_id !== id));
      setNominasSemanales((current) => current.filter((item) => item.empleado_id !== id));
      notify('success', 'El empleado y sus registros asociados fueron eliminados.');
    } else {
      notify('error', `No se pudo eliminar el empleado: ${error.message}`);
    }
  }

  async function handleCrearProceso(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nombre = nuevoProcesoNombre.trim();
    if (!nombre) return;

    setLoadingAction(true);
    const { data, error } = await supabase.from('procesos').insert({ nombre }).select('nombre').single();
    if (!error && data) {
      setCatalogoProcesos((current) => [...current, data as CatalogoProceso].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setProcesoEditValues((current) => ({ ...current, [nombre]: nombre }));
      setNuevoProcesoNombre('');
      notify('success', 'El proceso fue creado y ya está disponible en los selectores.');
    } else {
      notify('error', `No se pudo crear el proceso: ${error?.message ?? 'error desconocido'}`);
    }
    setLoadingAction(false);
  }

  async function handleActualizarProceso(nombreOriginal: string) {
    const nombre = procesoEditValues[nombreOriginal]?.trim();
    if (!nombre) return;

    setLoadingAction(true);
    const { error } = await supabase.from('procesos').update({ nombre }).eq('nombre', nombreOriginal);
    if (!error) {
      setCatalogoProcesos((current) => current
        .map((item) => item.nombre === nombreOriginal ? { nombre } : item)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setEmpleados((current) => current.map((empleado) => ({
        ...empleado,
        proceso_habitual: empleado.proceso_habitual === nombreOriginal ? nombre : empleado.proceso_habitual,
        procesos_asignados: empleado.procesos_asignados.map((item) => item === nombreOriginal ? nombre : item)
      })));
      setTarifas((current) => current.map((item) => item.proceso === nombreOriginal ? { ...item, proceso: nombre } : item));
      setRegistros((current) => current.map((item) => item.proceso === nombreOriginal ? { ...item, proceso: nombre } : item));
      setRegistrosAnalitica((current) => current.map((item) => item.proceso === nombreOriginal ? { ...item, proceso: nombre } : item));
      setRegistrosIngresoLibre((current) => current.map((item) => item.proceso === nombreOriginal ? { ...item, proceso: nombre } : item));
      setRegistroProcesoEditValues((current) => Object.fromEntries(
        Object.entries(current).map(([id, proceso]) => [id, proceso === nombreOriginal ? nombre : proceso])
      ));
      setProcesoEditValues((current) => {
        const siguiente = { ...current };
        delete siguiente[nombreOriginal];
        siguiente[nombre] = nombre;
        return siguiente;
      });
      if (nuevoTarifaProceso === nombreOriginal) setNuevoTarifaProceso(nombre);
      if (adminRegistroProceso === nombreOriginal) setAdminRegistroProceso(nombre);
      setNuevoEmpleadoProcesos((current) => current.map((item) => item === nombreOriginal ? nombre : item));
      notify('success', 'El proceso fue actualizado en empleados, tarifas y registros.');
    } else {
      notify('error', `No se pudo actualizar el proceso: ${error.message}`);
    }
    setLoadingAction(false);
  }

  async function handleEliminarProceso(nombre: string) {
    const { error } = await supabase.from('procesos').delete().eq('nombre', nombre);
    if (!error) {
      setCatalogoProcesos((current) => current.filter((item) => item.nombre !== nombre));
      notify('success', 'El proceso fue eliminado.');
    } else {
      notify('error', 'No se puede eliminar un proceso que esté asignado a empleados, tarifas o registros.');
    }
  }

  async function handleCrearMaterial(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const codigo = nuevoMaterialCodigo.trim();
    const nombre = nuevoMaterialNombre.trim();
    if (!codigo || !nombre) return;

    setLoadingAction(true);
    if (!nuevoMaterialLavado && !nuevoMaterialAglutinado) {
      notify('error', 'Selecciona al menos un proceso requerido para el material.');
      return;
    }

    const { data, error } = await supabase.from('materiales').insert({
      codigo,
      nombre,
      requiere_lavado: nuevoMaterialLavado,
      requiere_aglutinado: nuevoMaterialAglutinado
    }).select('codigo,nombre,requiere_lavado,requiere_aglutinado').single();
    if (!error && data) {
      setCatalogoMateriales((current) => [...current, data as CatalogoMaterial].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setMaterialEditValues((current) => ({ ...current, [codigo]: nombre }));
      setNuevoMaterialCodigo('');
      setNuevoMaterialNombre('');
      setNuevoMaterialLavado(false);
      setNuevoMaterialAglutinado(false);
      notify('success', 'El material fue creado y ya está disponible en los selectores.');
    } else {
      notify('error', `No se pudo crear el material: ${error?.message ?? 'error desconocido'}`);
    }
    setLoadingAction(false);
  }

  async function handleActualizarMaterial(material: CatalogoMaterial) {
    if (esMaterialSoplado(material)) {
      notify('error', 'Soplado es un material interno y no se puede modificar.');
      return;
    }
    const nombre = materialEditValues[material.codigo]?.trim();
    if (!nombre) return;
    if (!material.requiere_lavado && !material.requiere_aglutinado) {
      notify('error', 'El material debe requerir al menos lavado o aglutinado.');
      return;
    }
    const { error } = await supabase.from('materiales').update({
      nombre,
      requiere_lavado: material.requiere_lavado,
      requiere_aglutinado: material.requiere_aglutinado
    }).eq('codigo', material.codigo);
    if (!error) {
      setCatalogoMateriales((current) => current
        .map((item) => item.codigo === material.codigo ? { ...item, nombre } : item)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setMaterialEditValues((current) => ({ ...current, [material.codigo]: nombre }));
      notify('success', 'El nombre del material fue actualizado en todo el sistema.');
    } else {
      notify('error', `No se pudo actualizar el material: ${error.message}`);
    }
  }

  async function handleEliminarMaterial(codigo: string) {
    if (catalogoMateriales.some((material) => material.codigo === codigo && esMaterialSoplado(material))) {
      notify('error', 'Soplado es necesario para los descuentos diarios y no se puede eliminar.');
      return;
    }
    const { error } = await supabase.from('materiales').delete().eq('codigo', codigo);
    if (!error) {
      setCatalogoMateriales((current) => current.filter((item) => item.codigo !== codigo));
      setMaterialEditValues((current) => {
        const siguiente = { ...current };
        delete siguiente[codigo];
        return siguiente;
      });
      notify('success', 'El material fue eliminado.');
    } else {
      notify('error', 'No se puede eliminar un material que esté usado en tarifas o registros.');
    }
  }

  function toggleProcesoEmpleado(empleadoId: string, proceso: Proceso) {
    setEmpleados((current) => current.map((empleado) => {
      if (empleado.id !== empleadoId) return empleado;
      const asignados = empleado.procesos_asignados.includes(proceso)
        ? empleado.procesos_asignados.filter((item) => item !== proceso)
        : [...empleado.procesos_asignados, proceso];
      return { ...empleado, procesos_asignados: asignados };
    }));
  }

  function toggleNuevoEmpleadoProceso(proceso: Proceso) {
    setNuevoEmpleadoProcesos((current) =>
      current.includes(proceso)
        ? current.filter((item) => item !== proceso)
        : [...current, proceso]
    );
  }

  function getTarifaPrecio(proceso: string, material: string) {
    return tarifas.find((tarifa) => tarifa.proceso === proceso && tarifa.material === material)?.precio_unidad ?? 0;
  }

  function getTarifaRegistro(registro: RegistroDiario) {
    return getTarifaPrecio(registro.proceso, registro.material_referencia ?? registro.material);
  }

  function getPagoAdicional(empleadoId: string) {
    return pagosAdicionales.filter((pago) => pago.empleado_id === empleadoId).reduce((sum, pago) => sum + pago.valor, 0);
  }

  function getResumenNominaEmpleado(empleado: Empleado) {
    const esPlanta = esEmpleadoDePlanta(empleado);
    const registrosEmpleado = registros.filter(
      (registro) => registro.empleado_id === empleado.id && weekDates.includes(registro.fecha)
    );
    const totalKg = esPlanta ? 0 : registrosEmpleado.reduce((sum, registro) => sum + (registro.peso_kg ?? 0), 0);
    const subtotalProduccion = esPlanta ? 0 : registrosEmpleado.reduce(
      (sum, registro) => sum + ((registro.peso_kg ?? 0) * getTarifaRegistro(registro)),
      0
    );
    const pagoAdicional = getPagoAdicional(empleado.id);
    return { totalKg, subtotalProduccion, pagoAdicional, totalPagar: subtotalProduccion + pagoAdicional };
  }

  function exportSemanalCsv() {
    const headers = ['Empleado', ...weekDates, 'Total kg', 'Pago adicional', 'Total a pagar'];
    const rows = empleados.map((empleado) => {
      const esPlanta = esEmpleadoDePlanta(empleado);
      const values = weekDates.map((iso) => {
        if (esPlanta) return '0';
        const total = registros
          .filter((item) => item.empleado_id === empleado.id && item.fecha === iso)
          .reduce((sum, item) => sum + (item.peso_kg ?? 0), 0);
        return total.toFixed(0);
      });
      const resumen = getResumenNominaEmpleado(empleado);
      return [empleado.nombre, ...values, resumen.totalKg.toFixed(0), resumen.pagoAdicional.toFixed(2), resumen.totalPagar.toFixed(2)];
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
    const filas = registrosAnaliticaFiltrados.map((registro) => [
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
        {notification && (
          <Toast
            type={notification.type}
            message={notification.message}
            onClose={() => setNotification(null)}
          />
        )}
        <PrinterDialog
          open={printerDialogOpen}
          onClose={() => setPrinterDialogOpen(false)}
          onSelected={(printer) => {
            setQzPrinterName(printer);
            notify('success', `Impresora térmica seleccionada: ${printer}`);
          }}
        />
        <ConfirmDialog
          open={Boolean(confirmAction)}
          title={confirmAction?.title ?? ''}
          description={confirmAction?.description ?? ''}
          confirmLabel={confirmAction?.confirmLabel}
          variant={confirmAction?.variant}
          busy={confirmBusy}
          onCancel={() => !confirmBusy && setConfirmAction(null)}
          onConfirm={() => void executeConfirmedAction()}
        />
        <AppHeader
          title="Dashboard de nómina"
          subtitle="Administra tarifas, empleados y revisa el consolidado semanal."
          role={profile?.rol}
          email={user?.email ?? profile?.email}
          onSignOut={handleSignOut}
        />
      <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div><p className="eyebrow">Centro de control</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">Resumen de nómina</h2><p className="mt-1 text-sm text-slate-400">{isGerencial ? 'Consulta consolidados y analiza la producción.' : 'Gestiona la operación, tarifas y cierres desde un solo lugar.'}</p></div>
          <div className="badge-success w-fit"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Sistema operativo</div>
        </div>

        <nav aria-label="Módulos del dashboard" className="card p-2">
          <div className={`grid gap-1 ${isGerencial ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
            {!isGerencial && (
            <button
              type="button"
              onClick={() => setActiveTab('gestion')}
              className={`flex items-center justify-center gap-2 rounded-xl border-0 px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${activeTab === 'gestion' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-950/30' : 'bg-transparent text-slate-400 hover:bg-slate-800/70 hover:text-white'}`}
            >
              <Icon name="users" className="h-4 w-4" /><span className="hidden sm:inline">Gestión de </span>empleados
            </button>
            )}
            {!isGerencial && (
            <button
              type="button"
              onClick={() => setActiveTab('tarifas')}
              className={`flex items-center justify-center gap-2 rounded-xl border-0 px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${activeTab === 'tarifas' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-950/30' : 'bg-transparent text-slate-400 hover:bg-slate-800/70 hover:text-white'}`}
            >
              <Icon name="wallet" className="h-4 w-4" /> Tarifas
            </button>
            )}
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

        {!isGerencial && activeTab === 'gestion' && (
          <section className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-2xl font-semibold">Gestión de empleados</h2><p className="mt-1 text-sm text-slate-400">{empleados.length} empleados registrados</p></div>
              <button type="button" className="btn-secondary" aria-expanded={empleadosTableExpanded} aria-controls="tabla-gestion-empleados" onClick={() => setEmpleadosTableExpanded((current) => !current)}>
                <Icon name="chevronRight" className={`h-4 w-4 transition-transform ${empleadosTableExpanded ? 'rotate-90' : ''}`} />
                {empleadosTableExpanded ? 'Ocultar empleados' : 'Mostrar empleados'}
              </button>
            </div>
            {empleadosTableExpanded && <div id="tabla-gestion-empleados" className="responsive-table mt-6 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-300">
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Procesos asignados</th>
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
                        <div className="flex flex-wrap gap-3">
                          {procesos.map((procesoItem) => (
                            <label key={procesoItem} className="flex items-center gap-2 text-xs text-slate-300">
                              <input
                                type="checkbox"
                                checked={empleado.procesos_asignados.includes(procesoItem)}
                                onChange={() => toggleProcesoEmpleado(empleado.id, procesoItem)}
                                className="h-4 w-4 rounded border-slate-700 bg-slate-950"
                              />
                              {procesoItem}
                            </label>
                          ))}
                        </div>
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
                          onClick={() => setConfirmAction({ title: 'Eliminar empleado', description: `Se eliminará a ${empleado.nombre} y todos sus registros asociados. Esta acción no se puede deshacer.`, run: () => handleEliminarEmpleado(empleado.id) })}
                          className="rounded-2xl bg-rose-500 px-3 py-2 text-white transition hover:bg-rose-400"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}

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
                <fieldset className="space-y-2">
                  <legend className="text-sm text-slate-300">Procesos asignados</legend>
                  <div className="flex min-h-[50px] flex-wrap items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3">
                    {procesos.map((item) => (
                      <label key={item} className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={nuevoEmpleadoProcesos.includes(item)}
                          onChange={() => toggleNuevoEmpleadoProceso(item)}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-950"
                        />
                        {item}
                      </label>
                    ))}
                  </div>
                </fieldset>
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

            <div className="mt-8 grid gap-4 xl:grid-cols-2">
              <details className="group overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
                <summary className="flex cursor-pointer list-none items-center justify-between p-5 font-semibold text-white">
                  Procesos
                  <Icon name="chevronRight" className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-90" />
                </summary>
                <div className="space-y-4 border-t border-slate-800 p-5">
                  <form onSubmit={handleCrearProceso} className="flex flex-col gap-3 sm:flex-row">
                    <input
                      value={nuevoProcesoNombre}
                      onChange={(event) => setNuevoProcesoNombre(event.target.value)}
                      placeholder="Nombre del proceso"
                      className="field flex-1"
                      required
                    />
                    <button type="submit" disabled={loadingAction} className="btn-primary">
                      <Icon name="plus" className="h-4 w-4" /> Agregar
                    </button>
                  </form>
                  <div className="space-y-2">
                    {catalogoProcesos.map((proceso) => (
                      <div key={proceso.nombre} className="flex flex-col gap-2 rounded-2xl border border-slate-800 p-3 sm:flex-row">
                        <input
                          value={procesoEditValues[proceso.nombre] ?? proceso.nombre}
                          onChange={(event) => setProcesoEditValues((current) => ({
                            ...current,
                            [proceso.nombre]: event.target.value
                          }))}
                          className="field flex-1"
                        />
                        <button type="button" onClick={() => handleActualizarProceso(proceso.nombre)} className="rounded-xl bg-sky-500 px-3 py-2 text-sm text-white">
                          Guardar
                        </button>
                        <button type="button" onClick={() => setConfirmAction({ title: 'Eliminar proceso', description: `Se eliminará el proceso “${proceso.nombre}”. Solo será posible si no está asignado a empleados, tarifas o registros.`, run: () => handleEliminarProceso(proceso.nombre) })} className="rounded-xl bg-rose-500 px-3 py-2 text-sm text-white">
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </details>

              <details className="group overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
                <summary className="flex cursor-pointer list-none items-center justify-between p-5 font-semibold text-white">
                  Materiales
                  <Icon name="chevronRight" className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-90" />
                </summary>
                <div className="space-y-4 border-t border-slate-800 p-5">
                  <form onSubmit={handleCrearMaterial} className="grid gap-3 lg:grid-cols-[120px_1fr_auto_auto_auto] lg:items-center">
                    <input
                      value={nuevoMaterialCodigo}
                      onChange={(event) => setNuevoMaterialCodigo(event.target.value)}
                      placeholder="Código"
                      className="field"
                      required
                    />
                    <input
                      value={nuevoMaterialNombre}
                      onChange={(event) => setNuevoMaterialNombre(event.target.value)}
                      placeholder="Nombre del material"
                      className="field"
                      required
                    />
                    <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 text-sm text-slate-300">
                      <input type="checkbox" checked={nuevoMaterialLavado} onChange={(event) => setNuevoMaterialLavado(event.target.checked)} className="h-4 w-4" />
                      Lavado
                    </label>
                    <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 text-sm text-slate-300">
                      <input type="checkbox" checked={nuevoMaterialAglutinado} onChange={(event) => setNuevoMaterialAglutinado(event.target.checked)} className="h-4 w-4" />
                      Aglutinado
                    </label>
                    <button type="submit" disabled={loadingAction} className="btn-primary">
                      <Icon name="plus" className="h-4 w-4" /> Agregar
                    </button>
                  </form>
                  <div className="space-y-2">
                    {catalogoMateriales.map((material) => (
                      <div key={material.codigo} className="grid gap-3 rounded-2xl border border-slate-800 p-3 xl:grid-cols-[90px_minmax(180px,1fr)_auto_auto_auto_auto] xl:items-center">
                        <div className="flex items-center rounded-xl bg-slate-900 px-3 text-xs font-bold text-slate-400">{material.codigo}</div>
                        <input
                          value={materialEditValues[material.codigo] ?? material.nombre}
                          onChange={(event) => setMaterialEditValues((current) => ({
                            ...current,
                            [material.codigo]: event.target.value
                          }))}
                          className="field"
                        />
                        <label className="flex min-h-10 items-center gap-2 rounded-xl bg-slate-900/70 px-3 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={material.requiere_lavado}
                            onChange={(event) => setCatalogoMateriales((current) => current.map((item) => item.codigo === material.codigo ? { ...item, requiere_lavado: event.target.checked } : item))}
                            className="h-4 w-4"
                          />
                          Lavado
                        </label>
                        <label className="flex min-h-10 items-center gap-2 rounded-xl bg-slate-900/70 px-3 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={material.requiere_aglutinado}
                            onChange={(event) => setCatalogoMateriales((current) => current.map((item) => item.codigo === material.codigo ? { ...item, requiere_aglutinado: event.target.checked } : item))}
                            className="h-4 w-4"
                          />
                          Aglutinado
                        </label>
                        <button type="button" onClick={() => handleActualizarMaterial(material)} className="rounded-xl bg-sky-500 px-3 py-2 text-sm text-white">
                          Guardar
                        </button>
                        <button type="button" onClick={() => setConfirmAction({ title: 'Eliminar material', description: `Se eliminará el material “${materialDisplayNames[material.codigo] ?? material.codigo}”. Solo será posible si no está en uso.`, run: () => handleEliminarMaterial(material.codigo) })} className="rounded-xl bg-rose-500 px-3 py-2 text-sm text-white">
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            </div>
          </section>
        )}

        {!isGerencial && activeTab === 'tarifas' && (
          <section className="space-y-4">
            <div className="card flex items-center justify-between gap-4 p-6 flex-wrap">
              <div>
                <h2 className="text-2xl font-semibold">Tarifas por proceso</h2>
                <p className="mt-2 text-slate-400">Administra precios, procesos y materiales en bloques independientes.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('consolidado')}
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-900"
              >
                Ver consolidado
              </button>
            </div>

            <details className="group card overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between p-5 font-semibold text-white">
                Tabla de tarifas
                <Icon name="chevronRight" className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-90" />
              </summary>
              <div className="border-t border-slate-800 bg-slate-950/30 p-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto] lg:items-end">
                  <label className="field-label">
                    <span>Proceso</span>
                    <select className="field-input" value={filtroTarifaProceso} onChange={(event) => setFiltroTarifaProceso(event.target.value)}>
                      <option value="">Todos los procesos</option>
                      {procesos.map((proceso) => <option key={proceso} value={proceso}>{proceso}</option>)}
                    </select>
                  </label>
                  <label className="field-label">
                    <span>Material</span>
                    <select className="field-input" value={filtroTarifaMaterial} onChange={(event) => setFiltroTarifaMaterial(event.target.value)}>
                      <option value="">Todos los materiales</option>
                      {materiales.map((material) => <option key={material} value={material}>{materialDisplayNames[material] ?? material}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn-secondary h-12 rounded-2xl px-5"
                    onClick={() => {
                      setFiltroTarifaProceso('');
                      setFiltroTarifaMaterial('');
                    }}
                  >
                    Limpiar
                  </button>
                </div>
                <p className="mt-4 text-xs text-slate-500">{tarifasFiltradas.length} de {tarifas.length} tarifas</p>
              </div>
              <div className="responsive-table overflow-x-auto border-t border-slate-800">
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
                  {tarifasFiltradas.map((tarifa) => (
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
            </details>

            <details className="group card overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between p-5 font-semibold text-white">
                Agregar nueva tarifa
                <Icon name="chevronRight" className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-90" />
              </summary>
              <div className="border-t border-slate-800 p-6">
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
            </details>
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
                  onChange={(event) => handleSemanaChange(event.target.value)}
                  className="rounded-2xl bg-slate-950 px-4 py-3"
                />
                {cargandoSemana && <span className="text-xs font-medium text-sky-300">Cargando semana...</span>}
                <button
                  type="button"
                  onClick={exportSemanalCsv}
                  className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                >
                  Exportar CSV semanal
                </button>
                <button
                  type="button"
                  onClick={() => setPrinterDialogOpen(true)}
                  className="btn-secondary"
                  title={qzPrinterName || 'Seleccionar impresora térmica'}
                >
                  <Icon name="printer" className="h-4 w-4" />
                  {qzPrinterName ? 'Cambiar impresora' : 'Configurar impresora'}
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
                  <th className="px-4 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {empleados.map((empleado) => {
                  const esPlanta = esEmpleadoDePlanta(empleado);
                  const dias = weekDates.map((iso) =>
                    esPlanta ? 0 : registros.filter((item) => item.empleado_id === empleado.id && item.fecha === iso).reduce((sum, item) => sum + (item.peso_kg ?? 0), 0)
                  );
                  const resumenNomina = getResumenNominaEmpleado(empleado);
                  return (
                    <tr key={empleado.id} className="border-b border-slate-800 hover:bg-slate-950/60">
                      <td className="px-4 py-3">{empleado.nombre}</td>
                      {dias.map((valor, index) => {
                    const detalles = getDetallesDelDia(empleado.id, weekDates[index]);
                    return (
                      <td
                        key={`${empleado.id}-${index}`}
                        className="px-4 py-3"
                        title={esPlanta ? 'Nómina fija de planta' : detalles.length ? detalles.join('\n') : 'Sin registros'}
                      >
                        {esPlanta ? '—' : valor.toFixed(0)}
                      </td>
                    );
                  })}
                      <td className="px-4 py-3 font-semibold text-sky-300">{esPlanta ? 'N/A' : resumenNomina.totalKg.toFixed(0)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-100">{formatCurrency(resumenNomina.pagoAdicional)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-300">
                        {formatCurrency(resumenNomina.totalPagar)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => void imprimirComprobanteNativo(empleado)}
                          disabled={Boolean(printingEmployeeId)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300 transition hover:border-sky-400/60 hover:bg-sky-500/20 hover:text-sky-200"
                          title={`Imprimir comprobante de ${empleado.nombre}`}
                          aria-label={`Imprimir comprobante de ${empleado.nombre}`}
                        >
                          {printingEmployeeId === empleado.id
                            ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-300/30 border-t-sky-300" />
                            : <Icon name="printer" className="h-5 w-5" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-slate-600 bg-slate-800/80">
                  <td className="px-4 py-4 text-xs font-bold uppercase tracking-wide text-white">Total general</td>
                  {weekDates.map((fecha) => <td key={`general-${fecha}`} className="px-4 py-4" />)}
                  <td className="px-4 py-4" />
                  <td className="px-4 py-4" />
                  <td className="px-4 py-4 font-bold text-emerald-300">{formatCurrency(totalAPagarSemana)}</td>
                  <td className="px-4 py-4" />
                </tr>
              </tbody>
              <tfoot className="hidden">
                <tr className="border-t-2 border-slate-600 border-b border-slate-700">
                  <th className="px-4 py-3 text-slate-300">Resumen diario</th>
                  {diasSemana.map((dia) => (
                    <th key={`resumen-${dia}`} className="px-4 py-3 text-slate-400">{dia}</th>
                  ))}
                  <th className="px-4 py-3 text-slate-400">Total kg</th>
                  <th className="px-4 py-3 text-slate-400">Pago adicional</th>
                  <th className="px-4 py-3 text-slate-400">Total a pagar</th>
                </tr>
                {resumenProcesoMaterialSemana.map((item) => (
                  <tr
                    key={`${item.proceso}-${item.material}`}
                    className="border-b border-slate-700/70"
                  >
                    <td className="px-4 py-2 text-xs font-medium text-slate-200">
                      {item.proceso} · {materialDisplayNames[item.material]}
                    </td>
                    {item.kilosPorDia.map((kilos, index) => (
                      <td
                        key={`${item.proceso}-${item.material}-${weekDates[index]}`}
                        className={`px-4 py-2 text-xs ${kilos ? 'font-semibold text-slate-100' : 'text-slate-500'}`}
                      >
                        {kilos.toFixed(0)} kg
                      </td>
                    ))}
                    <td className="px-4 py-2 text-xs font-semibold text-sky-300">
                      {item.totalKilos.toFixed(0)} kg
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">—</td>
                    <td className="px-4 py-2 text-xs font-semibold text-emerald-300">
                      {formatCurrency(item.totalPagar)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-700/50">
                  <td className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-white">
                    Total general
                  </td>
                  {weekDates.map((fecha) => {
                    const totalDia = registros
                      .filter((registro) => registro.fecha === fecha)
                      .reduce((total, registro) => total + (registro.peso_kg ?? 0), 0);
                    return (
                      <td key={`total-${fecha}`} className="px-4 py-3 text-xs font-bold text-white">
                        {totalDia.toFixed(0)} kg
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 font-bold text-sky-300">{totalKilosSemana.toFixed(0)} kg</td>
                  <td className="px-4 py-3 font-bold text-slate-100">{formatCurrency(totalPagosAdicionalesSemana)}</td>
                  <td className="px-4 py-3 font-bold text-emerald-300">{formatCurrency(totalAPagarSemana)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="space-y-3 border-t border-slate-800 bg-slate-950/30 p-4 sm:p-6">
            <div>
              <h3 className="text-lg font-semibold text-white">Resumen diario por proceso</h3>
              <p className="mt-1 text-xs text-slate-500">Los totales permanecen visibles cuando una subtabla está contraída.</p>
            </div>
            {resumenPorProcesoSemana.map((resumen) => (
              <details key={resumen.proceso} className="group overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/80">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <Icon name="chevronRight" className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-90" />
                    <span className="font-semibold text-white">{resumen.proceso}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span className="text-slate-400">Total proceso: <strong className="text-sky-300">{resumen.totalKilos.toFixed(0)} kg</strong></span>
                    <span className="text-slate-400">Total a pagar: <strong className="text-emerald-300">{formatCurrency(resumen.totalPagar)}</strong></span>
                  </div>
                </summary>
                <div className="overflow-x-auto border-t border-slate-700">
                  <table className="min-w-[1050px] border-collapse text-left text-xs">
                    <thead>
                      <tr>
                        <th className="px-4 py-3">Material</th>
                        {diasSemana.map((dia) => <th key={`${resumen.proceso}-${dia}`} className="px-4 py-3">{dia}</th>)}
                        <th className="px-4 py-3">Total kg</th>
                        <th className="px-4 py-3">Total a pagar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.materiales.map((item) => (
                        <tr key={`${resumen.proceso}-${item.material}`} className="border-t border-slate-800">
                          <td className="px-4 py-3 font-medium text-slate-200">{materialDisplayNames[item.material] ?? item.material}</td>
                          {item.kilosPorDia.map((kilos, index) => (
                            <td key={`${resumen.proceso}-${item.material}-${weekDates[index]}`} className={kilos ? 'px-4 py-3 font-semibold text-white' : 'px-4 py-3 text-slate-500'}>
                              {kilos.toFixed(0)} kg
                            </td>
                          ))}
                          <td className="px-4 py-3 font-semibold text-sky-300">{item.totalKilos.toFixed(0)} kg</td>
                          <td className="px-4 py-3 font-semibold text-emerald-300">{formatCurrency(item.totalPagar)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-600 bg-slate-800/80">
                        <td className="px-4 py-3 font-bold uppercase text-white">Total {resumen.proceso}</td>
                        {resumen.totalesPorDia.map((kilos, index) => (
                          <td key={`${resumen.proceso}-total-${weekDates[index]}`} className="px-4 py-3 font-bold text-white">{kilos.toFixed(0)} kg</td>
                        ))}
                        <td className="px-4 py-3 font-bold text-sky-300">{resumen.totalKilos.toFixed(0)} kg</td>
                        <td className="px-4 py-3 font-bold text-emerald-300">{formatCurrency(resumen.totalPagar)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </details>
            ))}
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
                      {isAdmin && <th className="px-4 py-3">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {registrosPorEmpleadoYDia.map((registro) => (
                      <tr key={registro.id} className="border-b border-slate-800 hover:bg-slate-950/60">
                        <td className="px-4 py-3">
                          {isAdmin ? (
                            <select
                              value={registroProcesoEditValues[registro.id] ?? registro.proceso}
                              onChange={(event) => setRegistroProcesoEditValues((current) => ({
                                ...current,
                                [registro.id]: event.target.value as Proceso
                              }))}
                              className="min-w-36 rounded-xl bg-slate-950 px-3 py-2"
                            >
                              {procesos.map((procesoItem) => (
                                <option key={procesoItem} value={procesoItem}>{procesoItem}</option>
                              ))}
                            </select>
                          ) : registro.proceso}
                        </td>
                        <td className="px-4 py-3">{materialDisplayNames[registro.material]}</td>
                        <td className="px-4 py-3">
                          {isAdmin ? (
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={registroEditValues[registro.id] ?? registro.peso_kg?.toString() ?? ''}
                              onChange={(event) => setRegistroEditValues((current) => ({
                                ...current,
                                [registro.id]: event.target.value
                              }))}
                              className="w-28 rounded-xl bg-slate-950 px-3 py-2"
                            />
                          ) : `${registro.peso_kg?.toFixed(0) ?? 0} kg`}
                        </td>
                        <td className="px-4 py-3">{registro.cantidad_bultos ?? '-'}</td>
                        <td className="px-4 py-3">{registro.creado_por || 'N/A'}</td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => handleActualizarRegistroDiario(registro.id)}
                              disabled={loadingAction}
                              className="rounded-xl bg-sky-500 px-3 py-2 text-white hover:bg-sky-400 disabled:opacity-60"
                            >
                              Guardar cambios
                            </button>
                          </td>
                        )}
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
                      <option key={empleado.id} value={empleado.id}>{empleado.nombre}{empleadoSoloLavador(empleado) ? ' · Solo Lavador' : ''}</option>
                    ))}
                  </select>
                  <span className="block text-xs text-slate-500">Selecciona cualquier empleado, incluido el Lavador, para consultar, corregir o eliminar sus registros.</span>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Kilos / gramos</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={adminRegistroKilos}
                    onChange={(event) => setAdminRegistroKilos(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' || loadingAction) return;
                      event.preventDefault();
                      void handleAdminCrearRegistro();
                    }}
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
                    {adminProcesosDisponibles.map((proceso) => (
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
                    {adminMaterialesDisponibles.map((material) => (
                      <option key={material.codigo} value={material.codigo}>{material.nombre}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void handleAdminCrearRegistro()}
                  disabled={loadingAction || !adminRegistroEmpleadoId || !adminRegistroProceso || (adminRequierePareado && (!adminProcesoPareado || !adminEmpleadoPareadoId))}
                  className="btn-primary h-[50px] w-full self-end bg-emerald-500 hover:bg-emerald-400"
                >
                  <Icon name="plus" className="h-4 w-4" /> Registrar kilos
                </button>
              </div>

              {(adminRequierePareado || adminAjusteSopladoRegistrado) && (
                <div className="mt-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/[.06] p-4">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-white">Lavado, aglutinado y soplado</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">La fecha seleccionada controla el único ajuste de soplado permitido para ese día.</p>
                  </div>
                  {adminRequierePareado && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm text-slate-300">Proceso complementario</span>
                        <select value={adminProcesoPareado} disabled className="field">
                          <option value={adminProcesoPareado}>{adminProcesoPareado || 'No configurado'}</option>
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm text-slate-300">Empleado de {adminProcesoPareado || 'proceso complementario'}</span>
                        <select value={adminEmpleadoPareadoId} onChange={(event) => setAdminEmpleadoPareadoId(event.target.value)} disabled={adminEmpleadosPareados.length <= 1} className="field">
                          {adminEmpleadosPareados.length === 0 && <option value="">No hay empleados disponibles</option>}
                          {adminEmpleadosPareados.map((empleado) => <option key={empleado.id} value={empleado.id}>{empleado.nombre}</option>)}
                        </select>
                        <span className="block text-xs text-slate-500">{adminEmpleadosPareados.length > 1 ? `Selecciona quién realizó ${adminProcesoPareado}.` : adminEmpleadosPareados.length === 1 ? `El único empleado de ${adminProcesoPareado} disponible fue asignado automáticamente.` : `Se necesita otro empleado activo para ${adminProcesoPareado}.`}</span>
                      </label>
                    </div>
                  )}
                  <div className={`grid gap-3 ${adminAjusteSopladoRegistrado ? 'mt-4 sm:grid-cols-[1fr_auto] sm:items-end' : adminRequierePareado ? 'mt-4' : ''}`}>
                    <label className="space-y-2">
                      <span className="flex items-center justify-between gap-3 text-sm text-slate-300">
                        Soplado de {adminRegistroDate}
                        <span className={adminAjusteSopladoRegistrado ? 'badge-success' : 'badge-warning'}>{adminAjusteSopladoRegistrado ? 'Registrado' : 'Nuevo'}</span>
                      </span>
                      <div className="relative">
                        <input type="number" min="0" step="0.1" inputMode="decimal" value={adminSopladoKg} onChange={(event) => setAdminSopladoKg(event.target.value)} className="field pr-12 text-lg font-semibold" />
                        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">kg</span>
                      </div>
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleAdminActualizarSoplado()}
                      disabled={loadingAction || (!adminAjusteSopladoRegistrado && (!adminProcesoPareado || !adminEmpleadoPareadoId))}
                      className="btn-secondary"
                    >
                      <Icon name="check" className="h-4 w-4" /> {adminAjusteSopladoRegistrado ? 'Guardar corrección' : 'Guardar soplado'}
                    </button>
                  </div>
                  {adminRequierePareado && (!adminProcesoPareado || !adminEmpleadoPareadoId) && <p role="alert" className="mt-3 text-xs font-medium text-amber-300">Configura un empleado activo para el proceso complementario antes de registrar.</p>}
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
                <span>La fecha, el empleado, el proceso y el material también filtran la tabla.</span>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold text-slate-200">
                    {cargandoIngresoLibre ? 'Consultando…' : `${registrosIngresoLibreFiltrados.length} registro(s) · ${registrosIngresoLibreSeleccionados.length} seleccionado(s)`}
                  </span>
                  <button
                    type="button"
                    disabled={loadingAction || registrosIngresoLibreSeleccionados.length === 0}
                    onClick={() => {
                      const ids = [...registrosIngresoLibreSeleccionados];
                      setConfirmAction({
                        title: `Eliminar ${ids.length} registro(s)`,
                        description: 'Los registros seleccionados desaparecerán del consolidado, la analítica y el ingreso libre. Esta acción no se puede deshacer.',
                        run: () => handleEliminarRegistrosDiarios(ids)
                      });
                    }}
                    className="rounded-xl bg-rose-500 px-3 py-2 font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Eliminar seleccionados
                  </button>
                </div>
              </div>
              <div className="responsive-table mt-6 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-300">
                      <th className="w-12 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Seleccionar todos los registros visibles"
                          checked={todosRegistrosIngresoLibreSeleccionados}
                          disabled={loadingAction || idsRegistrosIngresoLibreVisibles.length === 0}
                          onChange={(event) => setRegistrosIngresoLibreSeleccionados(
                            event.target.checked ? idsRegistrosIngresoLibreVisibles : []
                          )}
                          className="h-4 w-4 accent-indigo-500"
                        />
                      </th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Empleado</th>
                      <th className="px-4 py-3">Proceso</th>
                      <th className="px-4 py-3">Material</th>
                      <th className="px-4 py-3">Kilos</th>
                      <th className="px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrosIngresoLibreFiltrados.map((registro) => (
                      <tr key={registro.id} className="border-b border-slate-800 hover:bg-slate-950/60">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar registro de ${registro.fecha}`}
                            checked={registrosIngresoLibreSeleccionados.includes(registro.id)}
                            disabled={loadingAction}
                            onChange={(event) => setRegistrosIngresoLibreSeleccionados((actuales) =>
                              event.target.checked
                                ? [...actuales, registro.id]
                                : actuales.filter((id) => id !== registro.id)
                            )}
                            className="h-4 w-4 accent-indigo-500"
                          />
                        </td>
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
                          <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleActualizarRegistroDiario(registro.id)}
                            disabled={loadingAction}
                            className="rounded-2xl bg-sky-500 px-3 py-2 text-white transition hover:bg-sky-400 disabled:opacity-60"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmAction({ title: 'Eliminar registro de kilos', description: 'Este registro desaparecerá del consolidado, la analítica y el ingreso libre. Esta acción no se puede deshacer.', run: () => handleEliminarRegistroDiario(registro.id) })}
                            disabled={loadingAction}
                            className="rounded-2xl bg-rose-500 px-3 py-2 text-white transition hover:bg-rose-400 disabled:opacity-60"
                          >
                            Eliminar
                          </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!cargandoIngresoLibre && registrosIngresoLibreFiltrados.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                          No hay registros que coincidan con los cuatro filtros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <div className="card p-5 sm:p-6">
              <h3 className="text-xl font-semibold">Pagos adicionales</h3>
              <p className="mt-1 text-sm text-slate-400">Registra y consulta conceptos por fecha y empleado dentro de la semana.</p>
              {isAdmin && (
              <form onSubmit={handleCrearPagoAdicional} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Fecha</span>
                  <input type="date" min={weekDates[0]} max={weekDates[weekDates.length - 1]} value={nuevoPagoFecha} onChange={(event) => setNuevoPagoFecha(event.target.value)} disabled={semanaNominaNoEditable} className="w-full rounded-2xl bg-slate-900 px-4 py-3" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Empleado</span>
                  <select
                    value={pagoEmpleadoId}
                    onChange={(event) => setPagoEmpleadoId(event.target.value)}
                    disabled={semanaNominaNoEditable}
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
                    disabled={semanaNominaNoEditable}
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
                    disabled={semanaNominaNoEditable}
                    className="w-full rounded-2xl bg-slate-900 py-3 pl-9 pr-4"
                    placeholder="9.000"
                    aria-label="Valor del pago adicional en pesos colombianos"
                  />
                  </div>
                </label>
                <button
                  type="submit"
                  disabled={loadingAction || semanaNominaNoEditable}
                  className="h-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
                >
                  Agregar pago
                </button>
              </form>
              )}
              {nominaSemanaPagada && <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">Semana pagada: los conceptos permanecen disponibles como histórico y ya no pueden modificarse.</div>}
              <div className="mt-6 grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
                <label className="field-label"><span>Filtrar por fecha</span><input type="date" min={weekDates[0]} max={weekDates[weekDates.length - 1]} value={filtroPagoFecha} onChange={(event) => setFiltroPagoFecha(event.target.value)} className="field-input" /></label>
                <label className="field-label"><span>Filtrar por empleado</span><select value={filtroPagoEmpleado} onChange={(event) => setFiltroPagoEmpleado(event.target.value)} className="field-input"><option value="">Todos los empleados</option>{empleados.map((empleado) => <option key={empleado.id} value={empleado.id}>{empleado.nombre}</option>)}</select></label>
                <button type="button" className="btn-secondary h-12" onClick={() => { const hoy = formatLocalDate(new Date()); setFiltroPagoFecha(weekDates.includes(hoy) ? hoy : weekDates[0] ?? ''); setFiltroPagoEmpleado(''); }}>Restablecer filtros</button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{pagosAdicionalesFiltrados.length} de {pagosAdicionales.length} pagos adicionales</span><span>Total filtrado: <strong className="text-emerald-300">{formatCurrency(pagosAdicionalesFiltrados.reduce((sum, pago) => sum + pago.valor, 0))}</strong></span></div>
              <div className="mt-6 space-y-3">
                {pagosAdicionalesFiltrados.map((pago) => {
                  const editValues = pagoEditValues[pago.id] ?? { fecha: pago.fecha ?? weekDates[0] ?? '', descripcion: pago.descripcion, valor: formatCurrencyInput(String(pago.valor)) };
                  return <div key={pago.id} className="rounded-3xl border border-slate-800 bg-slate-900/95 p-4">
                    <p className="mb-3 font-semibold text-white">{empleados.find((emp) => emp.id === pago.empleado_id)?.nombre ?? 'Empleado'}</p>
                    <div className="grid gap-3 md:grid-cols-[160px_1fr_180px_auto] md:items-end">
                      <label className="field-label"><span>Fecha</span><input type="date" min={weekDates[0]} max={weekDates[weekDates.length - 1]} value={editValues.fecha} disabled={semanaNominaNoEditable || loadingAction} onChange={(event) => setPagoEditValues((current) => ({ ...current, [pago.id]: { ...editValues, fecha: event.target.value } }))} className="field-input" /></label>
                      <label className="field-label"><span>Concepto</span><input value={editValues.descripcion} disabled={semanaNominaNoEditable || loadingAction} onChange={(event) => setPagoEditValues((current) => ({ ...current, [pago.id]: { ...editValues, descripcion: event.target.value } }))} className="field-input" /></label>
                      <label className="field-label"><span>Valor</span><div className="relative"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-slate-500">$</span><input type="text" inputMode="numeric" value={editValues.valor} disabled={semanaNominaNoEditable || loadingAction} onChange={(event) => setPagoEditValues((current) => ({ ...current, [pago.id]: { ...editValues, valor: formatCurrencyInput(event.target.value) } }))} className="field-input pl-9" /></div></label>
                      {isAdmin && <div className="flex gap-2"><button type="button" onClick={() => void handleActualizarPagoAdicional(pago.id)} disabled={semanaNominaNoEditable || loadingAction} className="btn-primary h-12 px-3">Guardar</button><button type="button" onClick={() => void handleEliminarPagoAdicional(pago.id)} disabled={semanaNominaNoEditable || loadingAction} className="btn-danger h-12 px-3">Eliminar</button></div>}
                    </div>
                  </div>
                })}
                {!pagosAdicionalesFiltrados.length && <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">No hay pagos adicionales que coincidan con los filtros.</div>}
              </div>
            </div>
            <div className="card p-5 sm:p-6">
              <h3 className="text-xl font-semibold">Nómina semanal</h3>
              <p className="mt-2 text-slate-400">Guarda el total de pagos para esta semana.</p>
              {isAdmin && <button
                type="button"
                onClick={() => setConfirmAction({
                  title: 'Pagar y cerrar nómina',
                  description: `Se congelarán empleados, producción, tarifas y conceptos adicionales de la semana ${weekDates[0] ?? ''} a ${weekDates[weekDates.length - 1] ?? ''}. Después quedará disponible como histórico en Analítica y no podrá pagarse dos veces.`,
                  confirmLabel: 'Pagar nómina',
                  variant: 'primary',
                  run: handleGuardarNominaSemanal
                })}
                disabled={loadingAction || nominaSemanaPagada || !weekDates.length}
                className="mt-6 w-full rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
              >
                {nominaSemanaPagada ? 'Nómina pagada y cerrada' : 'Pagar y guardar nómina semanal'}
              </button>}
              <div className="mt-6 space-y-3 text-slate-300">
                <p>Total empleados: {empleados.length}</p>
                <p>Total pagos extras: {formatCurrency(pagosAdicionales.reduce((sum, pago) => sum + pago.valor, 0))}</p>
                <p className="font-semibold">Total a pagar general: {formatCurrency(totalAPagarSemana)}</p>
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
                <button type="button" onClick={exportAnaliticaCsv} disabled={!registrosAnaliticaFiltrados.length} className="btn-secondary">
                  <Icon name="download" className="h-4 w-4" /> Exportar CSV
                </button>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4 text-xs text-slate-400">
              <span className="badge bg-indigo-500/10 text-indigo-300 ring-indigo-500/20">
                {rangoAnalitica.inicio === rangoAnalitica.fin ? rangoAnalitica.inicio : `${rangoAnalitica.inicio} — ${rangoAnalitica.fin}`}
              </span>
              <span>{registrosAnalitica.length} registros encontrados</span>
              {cantidadFiltrosAnalitica > 0 && <><span className="badge-warning">{cantidadFiltrosAnalitica} {cantidadFiltrosAnalitica === 1 ? 'filtro activo' : 'filtros activos'}</span><button type="button" className="border-0 bg-transparent font-semibold text-indigo-300 hover:text-indigo-200" onClick={limpiarFiltrosDetalle}>Quitar filtros</button></>}
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="border-b border-slate-800 p-5 sm:p-6">
              <p className="eyebrow">Histórico contable</p>
              <div className="mt-1 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                <div><h3 className="text-xl font-bold text-white">Nóminas pagadas</h3><p className="mt-1 text-sm text-slate-400">Valores congelados al momento de cerrar cada semana.</p></div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  {cierresHistoricos.length > 0 && <label className="field-label min-w-64"><span>Seleccionar semana pagada</span><select className="field-input" value={filtroCierreNominaId} onChange={(event) => setFiltroCierreNominaId(event.target.value)}><option value="all">Todas las semanas</option>{cierresHistoricos.map((cierre, index) => <option key={cierre.id} value={cierre.id}>{index === 0 ? 'Última · ' : ''}{cierre.semana_inicio} — {cierre.semana_fin}</option>)}</select></label>}
                  <span className="badge-success h-fit">{cierresHistoricos.length} {cierresHistoricos.length === 1 ? 'cierre' : 'cierres'}</span>
                </div>
              </div>
            </div>
            {cierresHistoricos.length === 0 ? (
              <div className="grid min-h-36 place-items-center p-6 text-center"><div><Icon name="wallet" className="mx-auto h-8 w-8 text-slate-700" /><p className="mt-3 text-sm text-slate-500">No hay nóminas pagadas que coincidan con este periodo.</p></div></div>
            ) : (
              <div className="space-y-5 p-4 sm:p-6">
                {cierresHistoricosVisibles.map((cierre) => {
                  const nominasCierre = nominasHistoricas.filter((nomina) => nomina.cierre_id === cierre.id);
                  return (
                    <details key={cierre.id} className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/35" open={Boolean(cierresNominaExpandidos[cierre.id])} onToggle={(event) => { const abierto = event.currentTarget.open; setCierresNominaExpandidos((actual) => actual[cierre.id] === abierto ? actual : { ...actual, [cierre.id]: abierto }); }}>
                      <summary className="flex cursor-pointer list-none flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-3"><Icon name="chevronRight" className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-90" /><div><p className="font-bold text-white">Semana {cierre.semana_inicio} — {cierre.semana_fin}</p><p className="mt-1 text-xs text-slate-500">Pagada {new Date(cierre.pagado_at).toLocaleString('es-CO')}</p></div></div>
                        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <span className="badge bg-slate-800 text-slate-300">{cierre.total_empleados} empleados</span>
                          <span className="badge bg-sky-500/10 text-sky-300">{cierre.total_kg.toLocaleString('es-CO')} kg</span>
                          <span className="badge bg-amber-500/10 text-amber-300">Extras {formatCurrency(cierre.total_adicionales)}</span>
                          <span className="badge-success">Pagado {formatCurrency(cierre.total_pagado)}</span>
                        </div>
                      </summary>
                      <div className="responsive-table overflow-x-auto border-t border-slate-800">
                        <table className="w-full min-w-[980px] text-left text-sm">
                          <thead><tr><th className="px-4 py-3">Empleado</th><th className="px-4 py-3">Proceso</th><th className="px-4 py-3 text-right">Kilos</th><th className="px-4 py-3 text-right">Producción</th><th className="px-4 py-3">Conceptos adicionales</th><th className="px-4 py-3 text-right">Adicionales</th><th className="px-4 py-3 text-right">Total pagado</th></tr></thead>
                          <tbody>{nominasCierre.map((nomina) => (
                            <tr key={nomina.id} className="border-t border-slate-800/70">
                              <td data-label="Empleado" className="px-4 py-3 font-semibold text-white">
                                <span>{nomina.empleado_nombre ?? 'Empleado'}</span>
                                {Boolean(nomina.nomina_produccion_detalle?.length) && <details className="mt-2 font-normal"><summary className="cursor-pointer text-xs font-semibold text-indigo-300">Ver {nomina.nomina_produccion_detalle?.length} registros congelados</summary><div className="mt-2 min-w-72 space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3">{nomina.nomina_produccion_detalle?.map((detalle) => <div key={detalle.id} className="border-b border-slate-800 pb-2 text-xs last:border-0 last:pb-0"><p className="text-slate-300">{detalle.fecha} · {detalle.proceso} · {detalle.material_nombre}</p><p className={detalle.es_ajuste_soplado ? 'text-rose-300' : 'text-slate-500'}>{detalle.peso_kg.toLocaleString('es-CO')} kg × {formatCurrency(detalle.precio_unidad)} = {formatCurrency(detalle.subtotal)}</p></div>)}</div></details>}
                              </td>
                              <td data-label="Proceso" className="px-4 py-3 text-slate-300">{nomina.proceso_snapshot ?? '-'}</td>
                              <td data-label="Kilos" className="px-4 py-3 text-right">{nomina.total_kg.toLocaleString('es-CO')} kg</td>
                              <td data-label="Producción" className="px-4 py-3 text-right">{formatCurrency(nomina.subtotal_produccion ?? 0)}</td>
                              <td data-label="Conceptos" className="px-4 py-3"><div className="space-y-1">{nomina.nomina_pago_adicional_detalle?.length ? nomina.nomina_pago_adicional_detalle.map((detalle) => <div key={detalle.id} className="flex justify-between gap-3 text-xs"><span className="text-slate-400">{detalle.fecha} · {detalle.descripcion}</span><span className="whitespace-nowrap text-amber-300">{formatCurrency(detalle.valor)}</span></div>) : <span className="text-xs text-slate-600">Sin conceptos</span>}</div></td>
                              <td data-label="Adicionales" className="px-4 py-3 text-right text-amber-300">{formatCurrency(nomina.pago_adicional)}</td>
                              <td data-label="Total pagado" className="px-4 py-3 text-right font-bold text-emerald-300">{formatCurrency(nomina.total_pagar)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
          {cargandoAnalitica ? (
            <div className="card grid min-h-64 place-items-center"><div className="text-center"><span className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-indigo-400/20 border-t-indigo-400" /><p className="mt-3 text-sm text-slate-500">Consultando producción…</p></div></div>
          ) : (
          <>
          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
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
            <h3 className="text-xl font-semibold">Volumen por material picado</h3>
            <p className="mt-1 text-xs text-slate-500">Materia picada disponible para programar los siguientes turnos.</p>
            <div className="mt-4 space-y-3 text-slate-300">
              {materiales.map((material) => (
                <div key={material} className="flex items-center justify-between rounded-3xl bg-slate-950/70 px-4 py-3">
                  <span>{materialDisplayNames[material]}</span>
                  <span className="font-semibold text-violet-300">{(estadisticas.materialesPicado[material] ?? 0).toFixed(0)} kg</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-lg shadow-slate-950/20">
            <h3 className="text-xl font-semibold">Volumen por material aglutinado</h3>
            <p className="mt-1 text-xs text-slate-500">Salida final neta por material, incluyendo el descuento de soplado.</p>
            <div className="mt-4 space-y-3 text-slate-300">
              {materiales.map((material) => (
                <div key={material} className="flex items-center justify-between rounded-3xl bg-slate-950/70 px-4 py-3">
                  <span>{materialDisplayNames[material]}</span>
                  {(() => {
                    const valor = estadisticas.materialesAglutinado[material] ?? 0;
                    const materialCatalogo = catalogoMateriales.find((item) => item.codigo === material);
                    const soplado = Boolean(materialCatalogo && esMaterialSoplado(materialCatalogo));
                    return <span className={`font-semibold ${soplado ? 'text-rose-300' : 'text-sky-300'}`}>{soplado ? `${Math.abs(valor).toFixed(0)} kg descuento` : `${valor.toFixed(0)} kg`}</span>;
                  })()}
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
                <p className="text-3xl font-semibold text-sky-300">{estadisticas.totalEmpleadosPeriodo}</p>
                <p className="mt-1 text-xs text-slate-500">Empleados con registros en el periodo.</p>
              </div>
              <div className="rounded-3xl bg-slate-950/70 px-4 py-3">
                <p>Movimientos filtrados</p>
                <p className="text-3xl font-semibold text-sky-300">{registrosAnaliticaFiltrados.length}</p>
                <p className="mt-1 text-xs text-slate-500">{estadisticas.totalSalidasFinales} corresponden al proceso final Aglutinado.</p>
              </div>
              <div className="rounded-3xl bg-slate-950/70 px-4 py-3">
                <p>Total kg del periodo</p>
                <p className="text-3xl font-semibold text-sky-300">{estadisticas.totalFinalKg.toLocaleString('es-CO')} kg</p>
                <p className="mt-1 text-xs text-slate-500">{filtroDetalleProceso ? `Suma del proceso filtrado: ${filtroDetalleProceso}.` : 'Producción neta del proceso final Aglutinado.'}</p>
              </div>
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-800 p-5 sm:flex-row sm:items-center">
              <div><h3 className="font-bold text-white">Detalle del periodo</h3><p className="mt-1 text-xs text-slate-500">Trazabilidad por fecha, empleado, proceso y material.</p></div>
              <div className="flex flex-wrap items-center gap-3"><span className="badge-success">Neto: {totalDetalleAnalitica.toLocaleString('es-CO')} kg</span><button type="button" className="btn-secondary" aria-expanded={detalleAnaliticaExpanded} aria-controls="detalle-periodo-analitica" onClick={() => setDetalleAnaliticaExpanded((current) => !current)}><Icon name="chevronRight" className={`h-4 w-4 transition-transform ${detalleAnaliticaExpanded ? 'rotate-90' : ''}`} />{detalleAnaliticaExpanded ? 'Ocultar detalle' : 'Mostrar detalle'}</button></div>
            </div>
            {detalleAnaliticaExpanded && <div id="detalle-periodo-analitica">
            <div className="border-b border-slate-800 bg-slate-950/30 p-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr_1fr_auto] xl:items-end">
                <label className="field-label">
                  <span>Fecha</span>
                  <input
                    type="date"
                    className="field-input"
                    value={filtroDetalleFecha}
                    min={rangoAnalitica.inicio}
                    max={rangoAnalitica.fin}
                    onChange={(event) => setFiltroDetalleFecha(event.target.value)}
                  />
                </label>
                <label className="field-label">
                  <span>Empleado</span>
                  <select className="field-input" value={filtroDetalleEmpleado} onChange={(event) => setFiltroDetalleEmpleado(event.target.value)}>
                    <option value="">Todos los empleados</option>
                    {empleados.map((empleado) => <option key={empleado.id} value={empleado.id}>{empleado.nombre}</option>)}
                  </select>
                </label>
                <label className="field-label">
                  <span>Proceso</span>
                  <select className="field-input" value={filtroDetalleProceso} onChange={(event) => setFiltroDetalleProceso(event.target.value)}>
                    <option value="">Todos los procesos</option>
                    {procesos.map((proceso) => <option key={proceso} value={proceso}>{proceso}</option>)}
                  </select>
                </label>
                <label className="field-label">
                  <span>Material</span>
                  <select className="field-input" value={filtroDetalleMaterial} onChange={(event) => setFiltroDetalleMaterial(event.target.value)}>
                    <option value="">Todos los materiales</option>
                    {materiales.map((material) => <option key={material} value={material}>{materialDisplayNames[material]}</option>)}
                  </select>
                </label>
                <button type="button" className="btn-secondary h-12 rounded-2xl px-5" onClick={limpiarFiltrosDetalle}>Limpiar</button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {registrosAnaliticaFiltrados.length} de {registrosAnalitica.length} movimientos · {estadisticas.totalSalidasFinales} salidas finales de Aglutinado. Cada fila representa un registro real en Supabase.
              </p>
            </div>
            {registrosAnaliticaFiltrados.length === 0 ? (
              <div className="grid min-h-40 place-items-center p-6 text-center"><div><Icon name="file" className="mx-auto h-8 w-8 text-slate-700" /><p className="mt-3 text-sm text-slate-500">No hay producción registrada en este periodo.</p></div></div>
            ) : (
              <div className="responsive-table overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr><th className="px-5 py-3">Fecha</th><th className="px-5 py-3">Empleado</th><th className="px-5 py-3">Proceso</th><th className="px-5 py-3">Material</th><th className="px-5 py-3 text-right">Volumen</th></tr></thead>
                  <tbody>
                    {registrosAnaliticaFiltrados.map((registro) => (
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
            </div>}
          </div>
          </>
          )}
        </section>
        )}
      </main>
    </div>
  );
}
