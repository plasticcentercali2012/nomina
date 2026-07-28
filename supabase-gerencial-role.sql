-- Migración idempotente para agregar el rol gerencial y aplicar privilegios reales.
-- Ejecutar una vez en Supabase SQL Editor.

alter table public.usuarios_sistema
  drop constraint if exists usuarios_sistema_rol_check;

alter table public.usuarios_sistema
  add constraint usuarios_sistema_rol_check
  check (rol in ('admin', 'encargado', 'gerencial'));

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.usuarios_sistema where id = auth.uid();
$$;

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

-- Usuarios: todos pueden leer su perfil; solamente admin administra usuarios.
drop policy if exists "insert usuarios autenticados" on public.usuarios_sistema;
drop policy if exists "update usuarios autenticados" on public.usuarios_sistema;
drop policy if exists "delete usuarios autenticados" on public.usuarios_sistema;
create policy "admin inserta usuarios" on public.usuarios_sistema for insert
  with check (public.current_app_role() = 'admin');
create policy "admin actualiza usuarios" on public.usuarios_sistema for update
  using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
create policy "admin elimina usuarios" on public.usuarios_sistema for delete
  using (public.current_app_role() = 'admin');

-- Empleados y tarifas: lectura para los tres roles; escritura solo admin.
drop policy if exists "modificar empleados autenticados" on public.empleados;
create policy "admin modifica empleados" on public.empleados for all
  using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

drop policy if exists "modificar tarifas autenticados" on public.tarifas;
create policy "admin modifica tarifas" on public.tarifas for all
  using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

-- Registros: gerencial solo consulta; encargado registra; admin administra.
drop policy if exists "insert registros autenticados" on public.registros_diarios;
drop policy if exists "update registros autenticados" on public.registros_diarios;
drop policy if exists "delete registros autenticados" on public.registros_diarios;
create policy "admin encargado insertan registros" on public.registros_diarios for insert
  with check (public.current_app_role() in ('admin', 'encargado'));
create policy "admin actualiza registros" on public.registros_diarios for update
  using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
create policy "admin elimina registros" on public.registros_diarios for delete
  using (public.current_app_role() = 'admin');

-- Pagos y nóminas: gerencial consulta consolidados, admin realiza cierres.
drop policy if exists "insert pagos adicionales autenticados" on public.pagos_adicionales;
drop policy if exists "update pagos adicionales autenticados" on public.pagos_adicionales;
drop policy if exists "delete pagos adicionales autenticados" on public.pagos_adicionales;
create policy "admin inserta pagos adicionales" on public.pagos_adicionales for insert
  with check (public.current_app_role() = 'admin');
create policy "admin actualiza pagos adicionales" on public.pagos_adicionales for update
  using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
create policy "admin elimina pagos adicionales" on public.pagos_adicionales for delete
  using (public.current_app_role() = 'admin');

drop policy if exists "insert nominas semanales autenticados" on public.nominas_semanales;
drop policy if exists "update nominas semanales autenticados" on public.nominas_semanales;
drop policy if exists "delete nominas semanales autenticados" on public.nominas_semanales;
create policy "admin inserta nominas semanales" on public.nominas_semanales for insert
  with check (public.current_app_role() = 'admin');
create policy "admin actualiza nominas semanales" on public.nominas_semanales for update
  using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
create policy "admin elimina nominas semanales" on public.nominas_semanales for delete
  using (public.current_app_role() = 'admin');

drop policy if exists "insert nominas mensuales autenticados" on public.nominas_mensuales;
drop policy if exists "update nominas mensuales autenticados" on public.nominas_mensuales;
drop policy if exists "delete nominas mensuales autenticados" on public.nominas_mensuales;
create policy "admin inserta nominas mensuales" on public.nominas_mensuales for insert
  with check (public.current_app_role() = 'admin');
create policy "admin actualiza nominas mensuales" on public.nominas_mensuales for update
  using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
create policy "admin elimina nominas mensuales" on public.nominas_mensuales for delete
  using (public.current_app_role() = 'admin');
