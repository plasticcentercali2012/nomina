begin;

alter table public.procesos
  add column if not exists paga_por_kilo boolean not null default true;

alter table public.pagos_adicionales
  add column if not exists proceso text null;
alter table public.pagos_adicionales drop constraint if exists pagos_adicionales_proceso_fkey;
alter table public.pagos_adicionales
  add constraint pagos_adicionales_proceso_fkey
  foreign key (proceso) references public.procesos(nombre) on update cascade;

alter table public.nomina_pago_adicional_detalle
  add column if not exists proceso text null;

create or replace function public.identificar_tipo_detalle_nomina()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.pago_adicional_id is not null then
    select p.proceso into new.proceso
    from public.pagos_adicionales p
    where p.id = new.pago_adicional_id;
  end if;
  new.tipo := case when new.valor < 0 then 'prestamo' else 'adicional' end;
  return new;
end;
$$;

comment on column public.procesos.paga_por_kilo is
  'Indica si el proceso se liquida por kilos. Si es falso se registra como concepto en pagos adicionales.';
comment on column public.pagos_adicionales.proceso is
  'Proceso sin pago por kilos que origina el concepto, cuando aplica.';

commit;
notify pgrst, 'reload schema';
