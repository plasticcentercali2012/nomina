begin;

create table if not exists public.empleado_procesos (
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  proceso text not null check (proceso in ('Picador', 'Lavador', 'Aglutinador')),
  created_at timestamptz not null default now(),
  primary key (empleado_id, proceso)
);

insert into public.empleado_procesos (empleado_id, proceso)
select id, proceso_habitual
from public.empleados
on conflict (empleado_id, proceso) do nothing;

alter table public.empleado_procesos enable row level security;

drop policy if exists "lectura procesos empleados autenticados" on public.empleado_procesos;
drop policy if exists "admin modifica procesos empleados" on public.empleado_procesos;

create policy "lectura procesos empleados autenticados"
  on public.empleado_procesos for select
  using (auth.role() = 'authenticated');

create policy "admin modifica procesos empleados"
  on public.empleado_procesos for all
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

grant select, insert, update, delete on public.empleado_procesos to authenticated;

commit;
