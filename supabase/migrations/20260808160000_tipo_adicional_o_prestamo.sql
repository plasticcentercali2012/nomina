begin;

alter table public.pagos_adicionales
  add column if not exists tipo text not null default 'adicional';
alter table public.pagos_adicionales drop constraint if exists pagos_adicionales_tipo_check;
alter table public.pagos_adicionales
  add constraint pagos_adicionales_tipo_check check (tipo in ('adicional', 'prestamo'));

alter table public.nomina_pago_adicional_detalle
  add column if not exists tipo text not null default 'adicional';
alter table public.nomina_pago_adicional_detalle drop constraint if exists nomina_pago_adicional_detalle_tipo_check;
alter table public.nomina_pago_adicional_detalle
  add constraint nomina_pago_adicional_detalle_tipo_check check (tipo in ('adicional', 'prestamo'));

create or replace function public.normalizar_valor_concepto_nomina()
returns trigger language plpgsql set search_path = public as $$
begin
  new.valor := case when new.tipo = 'prestamo' then -abs(new.valor) else abs(new.valor) end;
  return new;
end;
$$;

drop trigger if exists normalizar_valor_concepto_nomina on public.pagos_adicionales;
create trigger normalizar_valor_concepto_nomina
before insert or update on public.pagos_adicionales
for each row execute function public.normalizar_valor_concepto_nomina();

create or replace function public.identificar_tipo_detalle_nomina()
returns trigger language plpgsql set search_path = public as $$
begin
  new.tipo := case when new.valor < 0 then 'prestamo' else 'adicional' end;
  return new;
end;
$$;

drop trigger if exists identificar_tipo_detalle_nomina on public.nomina_pago_adicional_detalle;
create trigger identificar_tipo_detalle_nomina
before insert or update on public.nomina_pago_adicional_detalle
for each row execute function public.identificar_tipo_detalle_nomina();

comment on column public.pagos_adicionales.tipo is
  'Adicional suma a la nomina; prestamo se almacena negativo y se descuenta.';

commit;
notify pgrst, 'reload schema';
