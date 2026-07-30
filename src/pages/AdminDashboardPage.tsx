import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { AppHeader } from '../components/AppHeader';
import { CatalogoMaterial, CatalogoProceso, Empleado, NominaSemanal, PagoAdicional, Proceso, RegistroDiario, Tarifa, UsuarioSistema } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Icon } from '../components/ui/Icon';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { Toast } from '../components/ui/Toast';
import { formatLocalDate, parseLocalDate } from '../lib/dateUtils';

const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;
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

function parseCurrencyInput(value: string) {
  return Number(value.replace(/\D/g, '')) || 0;
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits ? new Intl.NumberFormat('es-CO').format(Number(digits)) : '';
}

function escapeReceiptText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  const [semanaInicio, setSemanaInicio] = useState('');
  const [cargandoSemana, setCargandoSemana] = useState(false);
  const solicitudSemanaActual = useRef(0);
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState('');
  const [selectedWeekDate, setSelectedWeekDate] = useState('');
  const [adminRegistroEmpleadoId, setAdminRegistroEmpleadoId] = useState('');
  const [adminRegistroDate, setAdminRegistroDate] = useState(formatLocalDate(new Date()));
  const [adminRegistroProceso, setAdminRegistroProceso] = useState<RegistroDiario['proceso']>('Picador');
  const [adminRegistroMaterial, setAdminRegistroMaterial] = useState<RegistroDiario['material']>('Poli');
  const [adminRegistroKilos, setAdminRegistroKilos] = useState('');
  const [registrosIngresoLibre, setRegistrosIngresoLibre] = useState<RegistroDiario[]>([]);
  const [cargandoIngresoLibre, setCargandoIngresoLibre] = useState(false);
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
  const [nuevoProcesoNombre, setNuevoProcesoNombre] = useState('');
  const [procesoEditValues, setProcesoEditValues] = useState<Record<string, string>>({});
  const [nuevoMaterialCodigo, setNuevoMaterialCodigo] = useState('');
  const [nuevoMaterialNombre, setNuevoMaterialNombre] = useState('');
  const [materialEditValues, setMaterialEditValues] = useState<Record<string, string>>({});

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
    supabase.from('materiales').select('codigo,nombre').order('nombre').then(({ data }) => {
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
    const inicio = parseLocalDate(semanaInicio);
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + diasSemana.length - 1);
    const semanaFin = formatLocalDate(fin);

    async function cargarSemana() {
      setCargandoSemana(true);
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
      setPagosAdicionales((resultadoPagos.data ?? []) as PagoAdicional[]);
      setNominasSemanales((resultadoNominas.data ?? []) as NominaSemanal[]);
      setRegistroEditValues(Object.fromEntries(registrosData.map((item) => [item.id, item.peso_kg?.toString() ?? ''])));
      setRegistroProcesoEditValues(Object.fromEntries(registrosData.map((item) => [item.id, item.proceso])));
      setCargandoSemana(false);
    }

    void cargarSemana();
  }, [semanaInicio]);

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
    if (activeTab !== 'analitica') return;
    const claveRango = `${rangoAnalitica.inicio}:${rangoAnalitica.fin}`;
    if (rangoAnaliticaCargado === claveRango) return;
    setCargandoAnalitica(true);
    supabase
      .from('registros_diarios')
      .select('*')
      .gte('fecha', rangoAnalitica.inicio)
      .lte('fecha', rangoAnalitica.fin)
      .order('fecha', { ascending: true })
      .then(({ data }) => {
        setRegistrosAnalitica((data as RegistroDiario[]) ?? []);
        setRangoAnaliticaCargado(claveRango);
        setCargandoAnalitica(false);
      });
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
      setAdminRegistroEmpleadoId(empleados[0].id);
    }
  }, [empleados, selectedEmpleadoId, adminRegistroEmpleadoId]);

  useEffect(() => {
    if (weekDates.length && !weekDates.includes(selectedWeekDate)) {
      setSelectedWeekDate(weekDates[0]);
      setAdminRegistroDate(weekDates[0]);
    }
  }, [weekDates, selectedWeekDate]);

  useEffect(() => {
    const empleado = empleados.find((item) => item.id === adminRegistroEmpleadoId);
    if (empleado) {
      setAdminRegistroProceso(empleado.procesos_asignados[0] ?? empleado.proceso_habitual);
    }
  }, [adminRegistroEmpleadoId, empleados]);

  useEffect(() => {
    if (!isAdmin || !adminRegistroDate) return;

    setCargandoIngresoLibre(true);
    supabase
      .from('registros_diarios')
      .select('*')
      .eq('fecha', adminRegistroDate)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
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
        } else {
          notify('error', `No se pudieron cargar los registros de la fecha: ${error.message}`);
        }
        setCargandoIngresoLibre(false);
      });
  }, [adminRegistroDate, isAdmin]);

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

    const { data, error } = await supabase
      .from('registros_diarios')
      .insert(newRecord)
      .select()
      .single();
    if (!error && data) {
      const registroCreado = data as RegistroDiario;
      setRegistrosIngresoLibre((current) => [
        registroCreado,
        ...current.filter((item) => item.id !== registroCreado.id)
      ]);
      if (weekDates.includes(registroCreado.fecha)) {
        setRegistros((current) => [...current, registroCreado]);
        setRegistroEditValues((current) => ({
          ...current,
          [registroCreado.id]: registroCreado.peso_kg?.toString() ?? ''
        }));
        setRegistroProcesoEditValues((current) => ({
          ...current,
          [registroCreado.id]: registroCreado.proceso
        }));
      }
      if (registroCreado.fecha >= rangoAnalitica.inicio && registroCreado.fecha <= rangoAnalitica.fin) {
        setRegistrosAnalitica((current) => [...current, registroCreado]);
      }
      setAdminRegistroKilos('');
      notify('success', 'El registro de kilos fue creado y los consolidados se actualizaron.');
    } else {
      notify('error', `No se pudo crear el registro: ${error?.message ?? 'error desconocido'}`);
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
          totalPagar: totalKilos * getTarifaPrecio(proceso, material)
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
              total + ((registro.peso_kg ?? 0) * getTarifaPrecio(registro.proceso, registro.material)),
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
    () => registros
      .filter((registro) => weekDates.includes(registro.fecha))
      .reduce((total, registro) => total + (registro.peso_kg ?? 0), 0),
    [registros, weekDates]
  );

  const totalPagosAdicionalesSemana = useMemo(
    () => pagosAdicionales.reduce((total, pago) => total + pago.valor, 0),
    [pagosAdicionales]
  );

  const totalAPagarSemana = useMemo(
    () => registros
      .filter((registro) => weekDates.includes(registro.fecha))
      .reduce(
        (total, registro) =>
          total + ((registro.peso_kg ?? 0) * getTarifaPrecio(registro.proceso, registro.material)),
        totalPagosAdicionalesSemana
      ),
    [registros, tarifas, totalPagosAdicionalesSemana, weekDates]
  );

  function getDetallesDelDia(empleadoId: string, fecha: string) {
    return registros
      .filter((item) => item.empleado_id === empleadoId && item.fecha === fecha)
      .map((item) => `${item.proceso} ${materialDisplayNames[item.material]} ${item.peso_kg?.toFixed(0) ?? 0} kg`);
  }

  function imprimirComprobanteEmpleado(empleado: Empleado) {
    const registrosEmpleado = registros
      .filter((item) => item.empleado_id === empleado.id && weekDates.includes(item.fecha))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    const totalKg = registrosEmpleado.reduce((sum, item) => sum + (item.peso_kg ?? 0), 0);
    const subtotalProduccion = registrosEmpleado.reduce(
      (sum, item) => sum + ((item.peso_kg ?? 0) * getTarifaPrecio(item.proceso, item.material)),
      0
    );
    const pagoAdicional = getPagoAdicional(empleado.id);
    const totalPagar = subtotalProduccion + pagoAdicional;
    const comprobante = window.open('', '_blank', 'width=420,height=720');

    if (!comprobante) {
      notify('error', 'El navegador bloqueó la ventana de impresión. Habilita las ventanas emergentes para este sitio.');
      return;
    }

    const detalleDias = weekDates.map((fecha, index) => {
      const items = registrosEmpleado.filter((item) => item.fecha === fecha);
      const totalDiaKg = items.reduce((sum, item) => sum + (item.peso_kg ?? 0), 0);
      const totalDiaPago = items.reduce(
        (sum, item) => sum + ((item.peso_kg ?? 0) * getTarifaPrecio(item.proceso, item.material)),
        0
      );
      const mostrarSoloResumen = items.some((item) => usaResumenTermicoPorDia(item.proceso));
      const detalle = items.length
        ? mostrarSoloResumen
          ? ''
          : items.map((item) => {
          const kilos = item.peso_kg ?? 0;
          const precio = getTarifaPrecio(item.proceso, item.material);
          return `<div class="item">
            <div>${escapeReceiptText(item.proceso)} · ${escapeReceiptText(materialDisplayNames[item.material] ?? item.material)}</div>
            <div class="line"><span>${kilos.toLocaleString('es-CO')} kg × ${formatCurrency(precio)}</span><strong>${formatCurrency(kilos * precio)}</strong></div>
          </div>`;
          }).join('')
        : '<div class="empty">Sin registros</div>';

      return `<section class="day">
        <div class="day-title"><strong>${escapeReceiptText(diasSemana[index])}</strong><span>${escapeReceiptText(fecha)}</span></div>
        ${detalle}
        <div class="day-total"><span>Total día: ${totalDiaKg.toLocaleString('es-CO')} kg</span><strong>${formatCurrency(totalDiaPago)}</strong></div>
      </section>`;
    }).join('');

    comprobante.document.write(`<!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Comprobante ${escapeReceiptText(empleado.nombre)} - ${escapeReceiptText(semanaInicio)}</title>
        <style>
          @page { size: 58mm auto; margin: 2mm; }
          * { box-sizing: border-box; }
          body { width: 54mm; margin: 0 auto; color: #000; background: #fff; font: 10px/1.35 ui-monospace, "Courier New", monospace; }
          h1 { margin: 0; font-size: 14px; text-align: center; }
          .center { text-align: center; }
          .meta { margin: 3mm 0; padding: 2mm 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
          .meta strong { display: block; font-size: 11px; }
          .day { padding: 2mm 0; border-bottom: 1px dashed #000; break-inside: avoid; }
          .day-title, .line, .day-total, .total-line { display: flex; justify-content: space-between; gap: 2mm; }
          .day-title { margin-bottom: 1mm; }
          .item { margin: 1.5mm 0; }
          .line { font-size: 9px; }
          .empty { color: #555; font-style: italic; }
          .day-total { margin-top: 1.5mm; font-weight: 700; }
          .totals { margin-top: 3mm; }
          .total-line { margin: 1mm 0; }
          .grand-total { margin-top: 2mm; padding: 2mm 0; border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 13px; font-weight: 700; }
          .footer { margin: 4mm 0 2mm; text-align: center; font-size: 9px; }
          @media screen { body { padding: 3mm 0; } }
        </style>
      </head>
      <body>
        <h1>COMPROBANTE DE PAGO</h1>
        <div class="meta">
          <strong>${escapeReceiptText(empleado.nombre)}</strong>
          <div>Semana: ${escapeReceiptText(weekDates[0] ?? '')} al ${escapeReceiptText(weekDates[weekDates.length - 1] ?? '')}</div>
          <div>Emitido: ${escapeReceiptText(new Date().toLocaleString('es-CO'))}</div>
        </div>
        ${detalleDias}
        <div class="totals">
          <div class="total-line"><span>Total kilos</span><strong>${totalKg.toLocaleString('es-CO')} kg</strong></div>
          <div class="total-line"><span>Producción</span><strong>${formatCurrency(subtotalProduccion)}</strong></div>
          <div class="total-line"><span>Pago adicional</span><strong>${formatCurrency(pagoAdicional)}</strong></div>
          <div class="total-line grand-total"><span>TOTAL A PAGAR</span><strong>${formatCurrency(totalPagar)}</strong></div>
        </div>
        <div class="footer">Comprobante informativo de nómina</div>
      </body>
      </html>`);
    comprobante.document.close();
    comprobante.focus();
    window.setTimeout(() => comprobante.print(), 250);
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
    const valorPago = parseCurrencyInput(nuevoPagoValor);
    if (!pagoEmpleadoId || !nuevoPagoDescripcion.trim() || valorPago <= 0) return;

    setLoadingAction(true);
    const { data, error } = await supabase
      .from('pagos_adicionales')
      .insert([{ empleado_id: pagoEmpleadoId, semana_inicio: weekDates[0], descripcion: nuevoPagoDescripcion.trim(), valor: valorPago }])
      .select()
      .single();
    if (!error && data) {
      setPagosAdicionales((current) => [...current, data as PagoAdicional]);
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

    const { data, error } = await supabase
      .from('nominas_semanales')
      .upsert(insertData, { onConflict: 'semana_inicio,empleado_id' })
      .select();
    if (!error && data) {
      setNominasSemanales(data as NominaSemanal[]);
      notify('success', 'La nómina semanal fue guardada correctamente.');
    } else {
      notify('error', `No se pudo guardar la nómina: ${error?.message ?? 'error desconocido'}`);
    }
    setLoadingAction(false);
  }

  async function handleEliminarPagoAdicional(id: string) {
    const { error } = await supabase.from('pagos_adicionales').delete().eq('id', id);
    if (!error) {
      setPagosAdicionales((current) => current.filter((pago) => pago.id !== id));
      notify('success', 'El pago adicional fue eliminado y los totales se actualizaron.');
    } else {
      notify('error', `No se pudo eliminar el pago: ${error.message}`);
    }
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
    if (!window.confirm('¿Eliminar este registro de kilos? Esta acción no se puede deshacer.')) return;

    setLoadingAction(true);
    const { error } = await supabase.from('registros_diarios').delete().eq('id', id);
    if (!error) {
      setRegistros((current) => current.filter((item) => item.id !== id));
      setRegistrosAnalitica((current) => current.filter((item) => item.id !== id));
      setRegistrosIngresoLibre((current) => current.filter((item) => item.id !== id));
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
    if (!window.confirm('¿Eliminar este empleado y todos sus registros asociados?')) return;

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
    if (!window.confirm(`¿Eliminar el proceso "${nombre}"?`)) return;
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
    const { data, error } = await supabase.from('materiales').insert({ codigo, nombre }).select('codigo,nombre').single();
    if (!error && data) {
      setCatalogoMateriales((current) => [...current, data as CatalogoMaterial].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setMaterialEditValues((current) => ({ ...current, [codigo]: nombre }));
      setNuevoMaterialCodigo('');
      setNuevoMaterialNombre('');
      notify('success', 'El material fue creado y ya está disponible en los selectores.');
    } else {
      notify('error', `No se pudo crear el material: ${error?.message ?? 'error desconocido'}`);
    }
    setLoadingAction(false);
  }

  async function handleActualizarMaterial(material: CatalogoMaterial) {
    const nombre = materialEditValues[material.codigo]?.trim();
    if (!nombre) return;
    const { error } = await supabase.from('materiales').update({ nombre }).eq('codigo', material.codigo);
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
    if (!window.confirm(`¿Eliminar el material "${materialDisplayNames[codigo] ?? codigo}"?`)) return;
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
            <h2 className="text-2xl font-semibold">Gestión de empleados</h2>
            <div className="responsive-table mt-6 overflow-x-auto">
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
                  CRUD de procesos
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
                        <button type="button" onClick={() => handleEliminarProceso(proceso.nombre)} className="rounded-xl bg-rose-500 px-3 py-2 text-sm text-white">
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </details>

              <details className="group overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
                <summary className="flex cursor-pointer list-none items-center justify-between p-5 font-semibold text-white">
                  CRUD de materiales
                  <Icon name="chevronRight" className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-90" />
                </summary>
                <div className="space-y-4 border-t border-slate-800 p-5">
                  <form onSubmit={handleCrearMaterial} className="grid gap-3 sm:grid-cols-[120px_1fr_auto]">
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
                    <button type="submit" disabled={loadingAction} className="btn-primary">
                      <Icon name="plus" className="h-4 w-4" /> Agregar
                    </button>
                  </form>
                  <div className="space-y-2">
                    {catalogoMateriales.map((material) => (
                      <div key={material.codigo} className="grid gap-2 rounded-2xl border border-slate-800 p-3 sm:grid-cols-[90px_1fr_auto_auto]">
                        <div className="flex items-center rounded-xl bg-slate-900 px-3 text-xs font-bold text-slate-400">{material.codigo}</div>
                        <input
                          value={materialEditValues[material.codigo] ?? material.nombre}
                          onChange={(event) => setMaterialEditValues((current) => ({
                            ...current,
                            [material.codigo]: event.target.value
                          }))}
                          className="field"
                        />
                        <button type="button" onClick={() => handleActualizarMaterial(material)} className="rounded-xl bg-sky-500 px-3 py-2 text-sm text-white">
                          Guardar
                        </button>
                        <button type="button" onClick={() => handleEliminarMaterial(material.codigo)} className="rounded-xl bg-rose-500 px-3 py-2 text-sm text-white">
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

            <details open className="group card overflow-hidden">
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
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => imprimirComprobanteEmpleado(empleado)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300 transition hover:border-sky-400/60 hover:bg-sky-500/20 hover:text-sky-200"
                          title={`Imprimir comprobante de ${empleado.nombre}`}
                          aria-label={`Imprimir comprobante de ${empleado.nombre}`}
                        >
                          <Icon name="printer" className="h-5 w-5" />
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
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
                <span>La fecha, el empleado, el proceso y el material también filtran la tabla.</span>
                <span className="font-semibold text-slate-200">
                  {cargandoIngresoLibre ? 'Consultando…' : `${registrosIngresoLibreFiltrados.length} registro(s)`}
                </span>
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
                    {registrosIngresoLibreFiltrados.map((registro) => (
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
                            onClick={() => handleEliminarRegistroDiario(registro.id)}
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
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
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
              {isAdmin && (
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
              )}
              <div className="mt-6 space-y-3">
                {pagosAdicionales.map((pago) => (
                  <div key={pago.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/95 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-white">{empleados.find((emp) => emp.id === pago.empleado_id)?.nombre ?? 'Empleado'}</p>
                      <p className="text-sm text-slate-400">{pago.descripcion}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-emerald-300">{formatCurrency(pago.valor)}</span>
                      {isAdmin && <button
                        type="button"
                        onClick={() => handleEliminarPagoAdicional(pago.id)}
                        className="rounded-2xl bg-rose-500 px-3 py-2 text-sm text-white transition hover:bg-rose-400"
                      >Eliminar</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card p-5 sm:p-6">
              <h3 className="text-xl font-semibold">Nómina semanal</h3>
              <p className="mt-2 text-slate-400">Guarda el total de pagos para esta semana.</p>
              {isAdmin && <button
                type="button"
                onClick={handleGuardarNominaSemanal}
                disabled={loadingAction}
                className="mt-6 w-full rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
              >
                Guardar nómina semanal
              </button>}
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
              <span className="badge-success">{registrosAnaliticaFiltrados.reduce((sum, item) => sum + (item.peso_kg ?? 0), 0).toLocaleString('es-CO')} kg</span>
            </div>
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
                {registrosAnaliticaFiltrados.length} de {registrosAnalitica.length} registros · Usa los filtros individualmente o combínalos.
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
          </div>
          </>
          )}
        </section>
        )}
      </main>
    </div>
  );
}
