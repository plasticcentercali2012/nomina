begin;

create table if not exists public.usuarios_sistema (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  rol text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  proceso_habitual text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tarifas (
  id uuid primary key default gen_random_uuid(),
  proceso text not null,
  material text not null,
  precio_unidad numeric not null,
  created_at timestamptz not null default now(),
  unique (proceso, material)
);

create table if not exists public.registros_diarios (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references public.empleados(id) on delete cascade,
  fecha date not null,
  proceso text not null,
  material text not null,
  peso_kg numeric,
  cantidad_bultos numeric,
  creado_por uuid references public.usuarios_sistema(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.pagos_adicionales (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references public.empleados(id) on delete cascade,
  semana_inicio date not null,
  descripcion text not null,
  valor numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.nominas_semanales (
  id uuid primary key default gen_random_uuid(),
  semana_inicio date not null,
  empleado_id uuid references public.empleados(id) on delete cascade,
  total_kg numeric not null,
  pago_adicional numeric not null,
  total_pagar numeric not null,
  created_at timestamptz not null default now(),
  unique (semana_inicio, empleado_id)
);

create table if not exists public.nominas_mensuales (
  id uuid primary key default gen_random_uuid(),
  anio integer not null,
  mes integer not null,
  empleado_id uuid references public.empleados(id) on delete cascade,
  total_kg numeric not null,
  pago_adicional numeric not null,
  total_pagar numeric not null,
  created_at timestamptz not null default now(),
  unique (anio, mes, empleado_id)
);

alter table public.usuarios_sistema
  drop constraint if exists usuarios_sistema_rol_check;
alter table public.usuarios_sistema
  add constraint usuarios_sistema_rol_check
  check (rol in ('admin', 'encargado', 'gerencial'));

alter table public.empleados
  drop constraint if exists empleados_proceso_habitual_check;
alter table public.empleados
  add constraint empleados_proceso_habitual_check
  check (proceso_habitual in ('Picador', 'Lavador', 'Aglutinador'));

alter table public.tarifas
  drop constraint if exists tarifas_proceso_check;
alter table public.tarifas
  add constraint tarifas_proceso_check
  check (proceso in ('Picador', 'Lavador', 'Aglutinador'));
alter table public.tarifas
  drop constraint if exists tarifas_material_check;
alter table public.tarifas
  add constraint tarifas_material_check
  check (material in ('Poli', 'M', 'T'));

alter table public.registros_diarios
  drop constraint if exists registros_diarios_proceso_check;
alter table public.registros_diarios
  add constraint registros_diarios_proceso_check
  check (proceso in ('Picador', 'Lavador', 'Aglutinador'));
alter table public.registros_diarios
  drop constraint if exists registros_diarios_material_check;
alter table public.registros_diarios
  add constraint registros_diarios_material_check
  check (material in ('Poli', 'M', 'T'));

alter table public.nominas_mensuales
  drop constraint if exists nominas_mensuales_mes_check;
alter table public.nominas_mensuales
  add constraint nominas_mensuales_mes_check
  check (mes between 1 and 12);

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol
  from public.usuarios_sistema
  where id = auth.uid();
$$;

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

alter table public.usuarios_sistema enable row level security;
alter table public.empleados enable row level security;
alter table public.tarifas enable row level security;
alter table public.registros_diarios enable row level security;
alter table public.pagos_adicionales enable row level security;
alter table public.nominas_semanales enable row level security;
alter table public.nominas_mensuales enable row level security;

drop policy if exists "lectura usuarios autenticados" on public.usuarios_sistema;
drop policy if exists "insert usuarios autenticados" on public.usuarios_sistema;
drop policy if exists "update usuarios autenticados" on public.usuarios_sistema;
drop policy if exists "delete usuarios autenticados" on public.usuarios_sistema;
drop policy if exists "admin inserta usuarios" on public.usuarios_sistema;
drop policy if exists "admin actualiza usuarios" on public.usuarios_sistema;
drop policy if exists "admin elimina usuarios" on public.usuarios_sistema;
create policy "lectura usuarios autenticados"
  on public.usuarios_sistema for select
  using (auth.role() = 'authenticated');
create policy "admin inserta usuarios"
  on public.usuarios_sistema for insert
  with check (public.current_app_role() = 'admin');
create policy "admin actualiza usuarios"
  on public.usuarios_sistema for update
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');
create policy "admin elimina usuarios"
  on public.usuarios_sistema for delete
  using (public.current_app_role() = 'admin');

drop policy if exists "lectura empleados autenticados" on public.empleados;
drop policy if exists "modificar empleados autenticados" on public.empleados;
drop policy if exists "admin modifica empleados" on public.empleados;
create policy "lectura empleados autenticados"
  on public.empleados for select
  using (auth.role() = 'authenticated');
create policy "admin modifica empleados"
  on public.empleados for all
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

drop policy if exists "lectura tarifas autenticados" on public.tarifas;
drop policy if exists "modificar tarifas autenticados" on public.tarifas;
drop policy if exists "admin modifica tarifas" on public.tarifas;
create policy "lectura tarifas autenticados"
  on public.tarifas for select
  using (auth.role() = 'authenticated');
create policy "admin modifica tarifas"
  on public.tarifas for all
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

drop policy if exists "lectura registros autenticados" on public.registros_diarios;
drop policy if exists "insert registros autenticados" on public.registros_diarios;
drop policy if exists "update registros autenticados" on public.registros_diarios;
drop policy if exists "delete registros autenticados" on public.registros_diarios;
drop policy if exists "admin encargado insertan registros" on public.registros_diarios;
drop policy if exists "admin actualiza registros" on public.registros_diarios;
drop policy if exists "admin elimina registros" on public.registros_diarios;
create policy "lectura registros autenticados"
  on public.registros_diarios for select
  using (auth.role() = 'authenticated');
create policy "admin encargado insertan registros"
  on public.registros_diarios for insert
  with check (public.current_app_role() in ('admin', 'encargado'));
create policy "admin actualiza registros"
  on public.registros_diarios for update
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');
create policy "admin elimina registros"
  on public.registros_diarios for delete
  using (public.current_app_role() = 'admin');

drop policy if exists "lectura pagos adicionales autenticados" on public.pagos_adicionales;
drop policy if exists "insert pagos adicionales autenticados" on public.pagos_adicionales;
drop policy if exists "update pagos adicionales autenticados" on public.pagos_adicionales;
drop policy if exists "delete pagos adicionales autenticados" on public.pagos_adicionales;
drop policy if exists "admin inserta pagos adicionales" on public.pagos_adicionales;
drop policy if exists "admin actualiza pagos adicionales" on public.pagos_adicionales;
drop policy if exists "admin elimina pagos adicionales" on public.pagos_adicionales;
create policy "lectura pagos adicionales autenticados"
  on public.pagos_adicionales for select
  using (auth.role() = 'authenticated');
create policy "admin inserta pagos adicionales"
  on public.pagos_adicionales for insert
  with check (public.current_app_role() = 'admin');
create policy "admin actualiza pagos adicionales"
  on public.pagos_adicionales for update
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');
create policy "admin elimina pagos adicionales"
  on public.pagos_adicionales for delete
  using (public.current_app_role() = 'admin');

drop policy if exists "lectura nominas semanales autenticados" on public.nominas_semanales;
drop policy if exists "insert nominas semanales autenticados" on public.nominas_semanales;
drop policy if exists "update nominas semanales autenticados" on public.nominas_semanales;
drop policy if exists "delete nominas semanales autenticados" on public.nominas_semanales;
drop policy if exists "admin inserta nominas semanales" on public.nominas_semanales;
drop policy if exists "admin actualiza nominas semanales" on public.nominas_semanales;
drop policy if exists "admin elimina nominas semanales" on public.nominas_semanales;
create policy "lectura nominas semanales autenticados"
  on public.nominas_semanales for select
  using (auth.role() = 'authenticated');
create policy "admin inserta nominas semanales"
  on public.nominas_semanales for insert
  with check (public.current_app_role() = 'admin');
create policy "admin actualiza nominas semanales"
  on public.nominas_semanales for update
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');
create policy "admin elimina nominas semanales"
  on public.nominas_semanales for delete
  using (public.current_app_role() = 'admin');

drop policy if exists "lectura nominas mensuales autenticados" on public.nominas_mensuales;
drop policy if exists "insert nominas mensuales autenticados" on public.nominas_mensuales;
drop policy if exists "update nominas mensuales autenticados" on public.nominas_mensuales;
drop policy if exists "delete nominas mensuales autenticados" on public.nominas_mensuales;
drop policy if exists "admin inserta nominas mensuales" on public.nominas_mensuales;
drop policy if exists "admin actualiza nominas mensuales" on public.nominas_mensuales;
drop policy if exists "admin elimina nominas mensuales" on public.nominas_mensuales;
create policy "lectura nominas mensuales autenticados"
  on public.nominas_mensuales for select
  using (auth.role() = 'authenticated');
create policy "admin inserta nominas mensuales"
  on public.nominas_mensuales for insert
  with check (public.current_app_role() = 'admin');
create policy "admin actualiza nominas mensuales"
  on public.nominas_mensuales for update
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');
create policy "admin elimina nominas mensuales"
  on public.nominas_mensuales for delete
  using (public.current_app_role() = 'admin');

grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.usuarios_sistema,
     public.empleados,
     public.tarifas,
     public.registros_diarios,
     public.pagos_adicionales,
     public.nominas_semanales,
     public.nominas_mensuales
  to authenticated;

commit;
