begin;

alter table public.pagos_adicionales
  add column if not exists fecha date;

update public.pagos_adicionales
set fecha = semana_inicio
where fecha is null;

alter table public.pagos_adicionales
  alter column fecha set not null,
  alter column fecha set default (now() at time zone 'America/Bogota')::date;

alter table public.pagos_adicionales
  drop constraint if exists pagos_adicionales_fecha_semana_check;
alter table public.pagos_adicionales
  add constraint pagos_adicionales_fecha_semana_check
  check (fecha between semana_inicio and semana_inicio + 5);

create index if not exists pagos_adicionales_fecha_empleado_idx
  on public.pagos_adicionales(fecha, empleado_id);

commit;

notify pgrst, 'reload schema';
