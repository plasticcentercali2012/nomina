begin;

alter table public.materiales
  add column if not exists requiere_lavado boolean not null default false,
  add column if not exists requiere_aglutinado boolean not null default false;

update public.materiales
set requiere_lavado = true,
    requiere_aglutinado = true
where codigo in ('Poli', 'M');

update public.materiales
set requiere_lavado = false,
    requiere_aglutinado = true
where codigo = 'T';

comment on column public.materiales.requiere_lavado is
  'Indica si el material puede y debe registrarse en el proceso de lavado.';
comment on column public.materiales.requiere_aglutinado is
  'Indica si el material puede y debe registrarse en el proceso de aglutinado.';

commit;

-- Fuerza a PostgREST/Supabase a reconocer inmediatamente las columnas nuevas.
notify pgrst, 'reload schema';
