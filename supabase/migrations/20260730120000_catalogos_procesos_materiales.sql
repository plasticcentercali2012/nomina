begin;

create table if not exists public.procesos (
  nombre text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.materiales (
  codigo text primary key,
  nombre text unique not null,
  created_at timestamptz not null default now()
);

insert into public.procesos (nombre)
values ('Picador'), ('Lavador'), ('Aglutinador')
on conflict (nombre) do nothing;

insert into public.materiales (codigo, nombre)
values ('Poli', 'Policolor'), ('M', 'Mono'), ('T', 'Termo')
on conflict (codigo) do update set nombre = excluded.nombre;

alter table public.empleados drop constraint if exists empleados_proceso_habitual_check;
alter table public.tarifas drop constraint if exists tarifas_proceso_check;
alter table public.tarifas drop constraint if exists tarifas_material_check;
alter table public.registros_diarios drop constraint if exists registros_diarios_proceso_check;
alter table public.registros_diarios drop constraint if exists registros_diarios_material_check;
alter table public.empleado_procesos drop constraint if exists empleado_procesos_proceso_check;

alter table public.empleados drop constraint if exists empleados_proceso_habitual_fkey;
alter table public.tarifas drop constraint if exists tarifas_proceso_fkey;
alter table public.tarifas drop constraint if exists tarifas_material_fkey;
alter table public.registros_diarios drop constraint if exists registros_diarios_proceso_fkey;
alter table public.registros_diarios drop constraint if exists registros_diarios_material_fkey;
alter table public.empleado_procesos drop constraint if exists empleado_procesos_proceso_fkey;

alter table public.empleados
  add constraint empleados_proceso_habitual_fkey
  foreign key (proceso_habitual) references public.procesos(nombre)
  on update cascade;

alter table public.tarifas
  add constraint tarifas_proceso_fkey
  foreign key (proceso) references public.procesos(nombre)
  on update cascade;
alter table public.tarifas
  add constraint tarifas_material_fkey
  foreign key (material) references public.materiales(codigo)
  on update cascade;

alter table public.registros_diarios
  add constraint registros_diarios_proceso_fkey
  foreign key (proceso) references public.procesos(nombre)
  on update cascade;
alter table public.registros_diarios
  add constraint registros_diarios_material_fkey
  foreign key (material) references public.materiales(codigo)
  on update cascade;

alter table public.empleado_procesos
  add constraint empleado_procesos_proceso_fkey
  foreign key (proceso) references public.procesos(nombre)
  on update cascade;

alter table public.procesos enable row level security;
alter table public.materiales enable row level security;

drop policy if exists "lectura procesos autenticados" on public.procesos;
drop policy if exists "admin modifica procesos" on public.procesos;
drop policy if exists "lectura materiales autenticados" on public.materiales;
drop policy if exists "admin modifica materiales" on public.materiales;

create policy "lectura procesos autenticados"
  on public.procesos for select
  using (auth.role() = 'authenticated');
create policy "admin modifica procesos"
  on public.procesos for all
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

create policy "lectura materiales autenticados"
  on public.materiales for select
  using (auth.role() = 'authenticated');
create policy "admin modifica materiales"
  on public.materiales for all
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

grant select, insert, update, delete on public.procesos, public.materiales to authenticated;

commit;
