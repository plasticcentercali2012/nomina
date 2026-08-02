import { Empleado, Proceso } from '../types';

export function etapaDelProceso(proceso: string): 'lavado' | 'aglutinado' | null {
  const normalizado = proceso.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (normalizado.startsWith('lav')) return 'lavado';
  if (normalizado.startsWith('aglut')) return 'aglutinado';
  return null;
}

export function empleadoTieneEtapa(empleado: Empleado, etapa: 'lavado' | 'aglutinado') {
  return empleado.procesos_asignados.some((proceso) => etapaDelProceso(proceso) === etapa);
}

export function procesosPrincipalesEmpleado(empleado: Empleado): Proceso[] {
  return empleado.procesos_asignados.filter((proceso) => etapaDelProceso(proceso) !== 'lavado');
}

export function empleadoSoloLavador(empleado: Empleado) {
  return empleadoTieneEtapa(empleado, 'lavado') && procesosPrincipalesEmpleado(empleado).length === 0;
}
