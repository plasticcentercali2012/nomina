begin;

create table if not exists public.cierres_nomina_semanal (
  id uuid primary key default gen_random_uuid(),
  semana_inicio date not null unique,
  semana_fin date not null,
  estado text not null default 'pagada' check (estado in ('pagada')),
  total_empleados integer not null default 0,
  total_kg numeric not null default 0,
  total_produccion numeric not null default 0,
  total_adicionales numeric not null default 0,
  total_pagado numeric not null default 0,
  pagado_por uuid references public.usuarios_sistema(id) on delete set null,
  pagado_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (semana_fin = semana_inicio + 5)
);

alter table public.nominas_semanales
  add column if not exists cierre_id uuid references public.cierres_nomina_semanal(id) on delete restrict,
  add column if not exists empleado_nombre text,
  add column if not exists proceso_snapshot text,
  add column if not exists subtotal_produccion numeric not null default 0,
  add column if not exists estado text not null default 'historica',
  add column if not exists pagado_at timestamptz;

update public.nominas_semanales n
set empleado_nombre = coalesce(n.empleado_nombre, e.nombre),
    proceso_snapshot = coalesce(n.proceso_snapshot, e.proceso_habitual),
    subtotal_produccion = n.total_pagar - n.pago_adicional,
    pagado_at = coalesce(n.pagado_at, n.created_at)
from public.empleados e
where n.empleado_id = e.id
  and (n.empleado_nombre is null or n.proceso_snapshot is null or n.pagado_at is null);

update public.nominas_semanales
set empleado_nombre = coalesce(empleado_nombre, 'Empleado eliminado'),
    proceso_snapshot = coalesce(proceso_snapshot, 'Sin proceso'),
    pagado_at = coalesce(pagado_at, created_at, now());

alter table public.nominas_semanales
  alter column empleado_nombre set default 'Empleado eliminado',
  alter column empleado_nombre set not null,
  alter column proceso_snapshot set default 'Sin proceso',
  alter column proceso_snapshot set not null,
  alter column pagado_at set default now(),
  alter column pagado_at set not null;

alter table public.nominas_semanales
  drop constraint if exists nominas_semanales_estado_check;
alter table public.nominas_semanales
  add constraint nominas_semanales_estado_check check (estado in ('historica', 'pagada'));

alter table public.nominas_semanales
  drop constraint if exists nominas_semanales_empleado_id_fkey;
alter table public.nominas_semanales
  add constraint nominas_semanales_empleado_id_fkey
  foreign key (empleado_id) references public.empleados(id) on delete set null;

create table if not exists public.nomina_produccion_detalle (
  id uuid primary key default gen_random_uuid(),
  nomina_semanal_id uuid not null references public.nominas_semanales(id) on delete cascade,
  registro_diario_id uuid references public.registros_diarios(id) on delete set null,
  fecha date not null,
  proceso text not null,
  material text not null,
  material_nombre text not null,
  peso_kg numeric not null,
  precio_unidad numeric not null,
  subtotal numeric not null,
  es_ajuste_soplado boolean not null default false,
  created_at timestamptz not null default now(),
  unique (nomina_semanal_id, registro_diario_id)
);

create table if not exists public.nomina_pago_adicional_detalle (
  id uuid primary key default gen_random_uuid(),
  nomina_semanal_id uuid not null references public.nominas_semanales(id) on delete cascade,
  pago_adicional_id uuid references public.pagos_adicionales(id) on delete set null,
  fecha date not null,
  descripcion text not null,
  valor numeric not null,
  created_at timestamptz not null default now(),
  unique (nomina_semanal_id, pago_adicional_id)
);

alter table public.nomina_pago_adicional_detalle
  add column if not exists fecha date;

update public.nomina_pago_adicional_detalle d
set fecha = coalesce(
  (select p.fecha from public.pagos_adicionales p where p.id = d.pago_adicional_id),
  (select n.semana_inicio from public.nominas_semanales n where n.id = d.nomina_semanal_id)
)
where d.fecha is null;

alter table public.nomina_pago_adicional_detalle
  alter column fecha set not null;

create index if not exists nominas_semanales_cierre_idx on public.nominas_semanales(cierre_id);
create index if not exists nominas_semanales_semana_idx on public.nominas_semanales(semana_inicio);
create index if not exists nomina_produccion_nomina_idx on public.nomina_produccion_detalle(nomina_semanal_id);
create index if not exists nomina_pago_adicional_nomina_idx on public.nomina_pago_adicional_detalle(nomina_semanal_id);

alter table public.cierres_nomina_semanal enable row level security;
alter table public.nomina_produccion_detalle enable row level security;
alter table public.nomina_pago_adicional_detalle enable row level security;

drop policy if exists "admin inserta nominas semanales" on public.nominas_semanales;
drop policy if exists "admin actualiza nominas semanales" on public.nominas_semanales;
drop policy if exists "admin elimina nominas semanales" on public.nominas_semanales;

drop policy if exists "lectura cierres nomina autenticados" on public.cierres_nomina_semanal;
drop policy if exists "lectura detalle produccion nomina autenticados" on public.nomina_produccion_detalle;
drop policy if exists "lectura detalle adicional nomina autenticados" on public.nomina_pago_adicional_detalle;

create policy "lectura cierres nomina autenticados"
  on public.cierres_nomina_semanal for select
  using (auth.role() = 'authenticated');
create policy "lectura detalle produccion nomina autenticados"
  on public.nomina_produccion_detalle for select
  using (auth.role() = 'authenticated');
create policy "lectura detalle adicional nomina autenticados"
  on public.nomina_pago_adicional_detalle for select
  using (auth.role() = 'authenticated');

grant select on public.cierres_nomina_semanal,
  public.nomina_produccion_detalle,
  public.nomina_pago_adicional_detalle to authenticated;

create or replace function public.cerrar_nomina_semanal(p_semana_inicio date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cierre_id uuid;
  v_nomina_id uuid;
  v_empleado record;
  v_es_planta boolean;
  v_proceso_planta text;
  v_total_kg numeric;
  v_subtotal numeric;
  v_adicional numeric;
begin
  if public.current_app_role() <> 'admin' then
    raise exception 'Solo un administrador puede pagar y cerrar la nómina.';
  end if;

  if p_semana_inicio is null or extract(isodow from p_semana_inicio) <> 1 then
    raise exception 'La fecha de inicio debe ser un lunes.';
  end if;

  perform pg_advisory_xact_lock(hashtext('cierre_nomina_' || p_semana_inicio::text));

  if exists (select 1 from public.cierres_nomina_semanal where semana_inicio = p_semana_inicio) then
    raise exception 'La nómina de la semana % ya fue pagada y cerrada.', p_semana_inicio;
  end if;

  insert into public.cierres_nomina_semanal (
    semana_inicio, semana_fin, pagado_por
  ) values (
    p_semana_inicio, p_semana_inicio + 5, auth.uid()
  ) returning id into v_cierre_id;

  for v_empleado in
    select e.*
    from public.empleados e
    where e.activo
       or exists (
         select 1 from public.registros_diarios r
         where r.empleado_id = e.id and r.fecha between p_semana_inicio and p_semana_inicio + 5
       )
       or exists (
         select 1 from public.pagos_adicionales p
         where p.empleado_id = e.id and p.semana_inicio = p_semana_inicio
       )
    order by e.nombre
  loop
    select min(proceso)
    into v_proceso_planta
    from (
        select v_empleado.proceso_habitual as proceso
        union all
        select ep.proceso from public.empleado_procesos ep where ep.empleado_id = v_empleado.id
    ) procesos_empleado
    where lower(trim(proceso)) in ('encargada', 'encargado', 'extrucionador', 'extrusionador', 'peletizador');
    v_es_planta := v_proceso_planta is not null;

    if not v_es_planta and exists (
      select 1
      from public.registros_diarios r
      left join public.tarifas t
        on t.proceso = r.proceso
       and t.material = coalesce(r.material_referencia, r.material)
      where r.empleado_id = v_empleado.id
        and r.fecha between p_semana_inicio and p_semana_inicio + 5
        and coalesce(r.peso_kg, 0) <> 0
        and t.id is null
    ) then
      raise exception 'No se puede cerrar: faltan tarifas para registros de %.', v_empleado.nombre;
    end if;

    if v_es_planta then
      v_total_kg := 0;
      v_subtotal := 0;
    else
      select
        coalesce(sum(coalesce(r.peso_kg, 0)), 0),
        coalesce(sum(coalesce(r.peso_kg, 0) * coalesce(t.precio_unidad, 0)), 0)
      into v_total_kg, v_subtotal
      from public.registros_diarios r
      left join public.tarifas t
        on t.proceso = r.proceso
       and t.material = coalesce(r.material_referencia, r.material)
      where r.empleado_id = v_empleado.id
        and r.fecha between p_semana_inicio and p_semana_inicio + 5;
    end if;

    select coalesce(sum(p.valor), 0)
    into v_adicional
    from public.pagos_adicionales p
    where p.empleado_id = v_empleado.id
      and p.semana_inicio = p_semana_inicio;

    insert into public.nominas_semanales (
      cierre_id, semana_inicio, empleado_id, empleado_nombre, proceso_snapshot,
      total_kg, subtotal_produccion, pago_adicional, total_pagar, estado, pagado_at
    ) values (
      v_cierre_id, p_semana_inicio, v_empleado.id, v_empleado.nombre,
      coalesce(v_proceso_planta, v_empleado.proceso_habitual),
      v_total_kg, v_subtotal, v_adicional, v_subtotal + v_adicional, 'pagada', now()
    )
    on conflict (semana_inicio, empleado_id) do update set
      cierre_id = excluded.cierre_id,
      empleado_nombre = excluded.empleado_nombre,
      proceso_snapshot = excluded.proceso_snapshot,
      total_kg = excluded.total_kg,
      subtotal_produccion = excluded.subtotal_produccion,
      pago_adicional = excluded.pago_adicional,
      total_pagar = excluded.total_pagar,
      estado = excluded.estado,
      pagado_at = excluded.pagado_at
    returning id into v_nomina_id;

    if not v_es_planta then
      insert into public.nomina_produccion_detalle (
        nomina_semanal_id, registro_diario_id, fecha, proceso, material,
        material_nombre, peso_kg, precio_unidad, subtotal, es_ajuste_soplado
      )
      select
        v_nomina_id, r.id, r.fecha, r.proceso, r.material,
        coalesce(m.nombre, r.material), coalesce(r.peso_kg, 0), coalesce(t.precio_unidad, 0),
        coalesce(r.peso_kg, 0) * coalesce(t.precio_unidad, 0), coalesce(r.es_ajuste_soplado, false)
      from public.registros_diarios r
      left join public.materiales m on m.codigo = r.material
      left join public.tarifas t
        on t.proceso = r.proceso
       and t.material = coalesce(r.material_referencia, r.material)
      where r.empleado_id = v_empleado.id
        and r.fecha between p_semana_inicio and p_semana_inicio + 5;
    end if;

    insert into public.nomina_pago_adicional_detalle (
      nomina_semanal_id, pago_adicional_id, fecha, descripcion, valor
    )
    select v_nomina_id, p.id, p.fecha, p.descripcion, p.valor
    from public.pagos_adicionales p
    where p.empleado_id = v_empleado.id
      and p.semana_inicio = p_semana_inicio;
  end loop;

  update public.cierres_nomina_semanal c
  set total_empleados = resumen.total_empleados,
      total_kg = resumen.total_kg,
      total_produccion = resumen.total_produccion,
      total_adicionales = resumen.total_adicionales,
      total_pagado = resumen.total_pagado
  from (
    select count(*)::integer total_empleados,
      coalesce(sum(total_kg), 0) total_kg,
      coalesce(sum(subtotal_produccion), 0) total_produccion,
      coalesce(sum(pago_adicional), 0) total_adicionales,
      coalesce(sum(total_pagar), 0) total_pagado
    from public.nominas_semanales
    where cierre_id = v_cierre_id
  ) resumen
  where c.id = v_cierre_id;

  return v_cierre_id;
end;
$$;

revoke all on function public.cerrar_nomina_semanal(date) from public;
grant execute on function public.cerrar_nomina_semanal(date) to authenticated;

comment on table public.cierres_nomina_semanal is 'Cabecera inmutable de cada pago semanal de nómina.';
comment on table public.nomina_produccion_detalle is 'Snapshot de producción y tarifas utilizado al pagar la nómina.';
comment on table public.nomina_pago_adicional_detalle is 'Snapshot de conceptos adicionales utilizado al pagar la nómina.';

create or replace function public.proteger_registro_nomina_pagada()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_fecha date;
begin
  v_fecha := case when tg_op = 'DELETE' then old.fecha else new.fecha end;
  if exists (
    select 1 from public.cierres_nomina_semanal
    where v_fecha between semana_inicio and semana_fin
  ) then
    raise exception 'La semana de la fecha % ya fue pagada; sus registros no se pueden modificar.', v_fecha;
  end if;

  if tg_op = 'UPDATE' and old.fecha <> new.fecha and exists (
    select 1 from public.cierres_nomina_semanal
    where old.fecha between semana_inicio and semana_fin
  ) then
    raise exception 'El registro pertenece a una nómina pagada y no se puede mover de fecha.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists proteger_registro_nomina_pagada on public.registros_diarios;
create trigger proteger_registro_nomina_pagada
before insert or update or delete on public.registros_diarios
for each row execute function public.proteger_registro_nomina_pagada();

create or replace function public.proteger_adicional_nomina_pagada()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_semana date;
begin
  v_semana := case when tg_op = 'DELETE' then old.semana_inicio else new.semana_inicio end;
  if exists (
    select 1 from public.cierres_nomina_semanal where semana_inicio = v_semana
  ) then
    raise exception 'La nómina de la semana % ya fue pagada; sus conceptos no se pueden modificar.', v_semana;
  end if;

  if tg_op = 'UPDATE' and old.semana_inicio <> new.semana_inicio and exists (
    select 1 from public.cierres_nomina_semanal where semana_inicio = old.semana_inicio
  ) then
    raise exception 'El concepto pertenece a una nómina pagada y no se puede mover de semana.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists proteger_adicional_nomina_pagada on public.pagos_adicionales;
create trigger proteger_adicional_nomina_pagada
before insert or update or delete on public.pagos_adicionales
for each row execute function public.proteger_adicional_nomina_pagada();

commit;

notify pgrst, 'reload schema';
