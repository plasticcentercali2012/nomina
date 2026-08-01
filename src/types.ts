export type Role = 'admin' | 'encargado' | 'gerencial';

export interface UsuarioSistema {
  id: string;
  email: string;
  rol: Role;
}

export interface Empleado {
  id: string;
  nombre: string;
  proceso_habitual: Proceso;
  procesos_asignados: Proceso[];
  activo: boolean;
}

export type Material = string;
export type Proceso = string;

export interface CatalogoProceso {
  nombre: string;
}

export interface CatalogoMaterial {
  codigo: string;
  nombre: string;
  requiere_lavado: boolean;
  requiere_aglutinado: boolean;
}

export interface Tarifa {
  id: string;
  proceso: Proceso;
  material: Material;
  precio_unidad: number;
}

export interface PagoAdicional {
  id: string;
  empleado_id: string;
  semana_inicio: string;
  fecha: string;
  descripcion: string;
  valor: number;
  created_at: string;
}

export interface NominaSemanal {
  id: string;
  cierre_id?: string | null;
  semana_inicio: string;
  empleado_id: string | null;
  empleado_nombre?: string;
  proceso_snapshot?: string;
  total_kg: number;
  subtotal_produccion?: number;
  pago_adicional: number;
  total_pagar: number;
  estado?: 'historica' | 'pagada';
  pagado_at?: string;
  created_at: string;
}

export interface CierreNominaSemanal {
  id: string;
  semana_inicio: string;
  semana_fin: string;
  estado: 'pagada';
  total_empleados: number;
  total_kg: number;
  total_produccion: number;
  total_adicionales: number;
  total_pagado: number;
  pagado_por: string | null;
  pagado_at: string;
}

export interface NominaPagoAdicionalDetalle {
  id: string;
  fecha: string;
  descripcion: string;
  valor: number;
}

export interface NominaProduccionDetalle {
  id: string;
  fecha: string;
  proceso: string;
  material: string;
  material_nombre: string;
  peso_kg: number;
  precio_unidad: number;
  subtotal: number;
  es_ajuste_soplado: boolean;
}

export interface NominaHistorica extends NominaSemanal {
  nomina_pago_adicional_detalle?: NominaPagoAdicionalDetalle[];
  nomina_produccion_detalle?: NominaProduccionDetalle[];
}

export interface NominaMensual {
  id: string;
  anio: number;
  mes: number;
  empleado_id: string;
  total_kg: number;
  pago_adicional: number;
  total_pagar: number;
  created_at: string;
}

export interface RegistroDiario {
  id: string;
  empleado_id: string;
  fecha: string;
  proceso: Proceso;
  material: Material;
  peso_kg: number | null;
  cantidad_bultos: number | null;
  creado_por: string;
  es_ajuste_soplado?: boolean;
  material_referencia?: Material | null;
}
