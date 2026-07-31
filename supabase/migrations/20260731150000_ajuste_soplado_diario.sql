begin;

alter table public.registros_diarios
  add column if not exists es_ajuste_soplado boolean not null default false,
  add column if not exists material_referencia text;

do $$
begin
  if exists (select 1 from public.materiales where lower(trim(nombre)) = 'soplado') then
    update public.materiales
    set requiere_lavado = false,
        requiere_aglutinado = false
    where lower(trim(nombre)) = 'soplado';
  else
    insert into public.materiales (codigo, nombre, requiere_lavado, requiere_aglutinado)
    values ('Soplado', 'Soplado', false, false)
    on conflict (codigo) do update
    set requiere_lavado = false,
        requiere_aglutinado = false;
  end if;
end $$;

create unique index if not exists registros_soplado_unico_fecha_proceso
  on public.registros_diarios (fecha, proceso)
  where es_ajuste_soplado = true;

comment on column public.registros_diarios.es_ajuste_soplado is
  'Ajuste negativo diario de soplado. Solo admite un registro por fecha y proceso.';
comment on column public.registros_diarios.material_referencia is
  'Material cuya tarifa se usa para valorar un ajuste de soplado.';

drop policy if exists "encargado actualiza soplado del dia" on public.registros_diarios;
create policy "encargado actualiza soplado del dia"
  on public.registros_diarios for update
  using (
    public.current_app_role() = 'encargado'
    and es_ajuste_soplado = true
    and fecha = (now() at time zone 'America/Bogota')::date
  )
  with check (
    public.current_app_role() = 'encargado'
    and es_ajuste_soplado = true
    and fecha = (now() at time zone 'America/Bogota')::date
  );

commit;

notify pgrst, 'reload schema';
