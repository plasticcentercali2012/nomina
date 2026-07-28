export type Role = 'admin' | 'encargado';

export interface UsuarioSistema {
  id: string;
  email: string;
  rol: Role;
}

export interface Empleado {
  id: string;
  nombre: string;
  proceso_habitual: 'Picador' | 'Lavador' | 'Aglutinador';
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
