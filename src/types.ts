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

export type Material = 'Poli' | 'M' | 'T';
export type Proceso = 'Picador' | 'Lavador' | 'Aglutinador';

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
  descripcion: string;
  valor: number;
  created_at: string;
}

export interface NominaSemanal {
  id: string;
  semana_inicio: string;
  empleado_id: string;
  total_kg: number;
  pago_adicional: number;
  total_pagar: number;
  created_at: string;
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
}
