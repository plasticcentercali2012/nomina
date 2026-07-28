-- Supabase SQL schema para Plastic Center Cali Nómina

-- Tabla usuarios de acceso
create table if not exists public.usuarios_sistema (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  rol text not null check (rol in ('admin', 'encargado')),
  created_at timestamptz not null default now()
);

-- Tabla empleados
create table if not exists public.empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  proceso_habitual text not null check (proceso_habitual in ('Picador', 'Lavador', 'Aglutinador')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Tabla tarifas
create table if not exists public.tarifas (
  id uuid primary key default gen_random_uuid(),
  proceso text not null check (proceso in ('Picador', 'Lavador', 'Aglutinador')),
  material text not null check (material in ('Poli', 'M', 'T')),
  precio_unidad numeric not null,
  created_at timestamptz not null default now(),
  unique (proceso, material)
);

-- Tabla registros diarios
create table if not exists public.registros_diarios (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references public.empleados(id) on delete cascade,
  fecha date not null,
  proceso text not null check (proceso in ('Picador', 'Lavador', 'Aglutinador')),
  material text not null check (material in ('Poli', 'M', 'T')),
  peso_kg numeric,
  cantidad_bultos numeric,
  creado_por uuid references public.usuarios_sistema(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Políticas RLS
alter table public.usuarios_sistema enable row level security;
create policy "lectura usuarios autenticados" on public.usuarios_sistema for select using (auth.role() = 'authenticated');
create policy "insert usuarios autenticados" on public.usuarios_sistema for insert with check (auth.role() = 'authenticated');
create policy "update usuarios autenticados" on public.usuarios_sistema for update using (auth.role() = 'authenticated');
create policy "delete usuarios autenticados" on public.usuarios_sistema for delete using (auth.role() = 'authenticated');

alter table public.empleados enable row level security;
create policy "lectura empleados autenticados" on public.empleados for select using (auth.role() = 'authenticated');
create policy "modificar empleados autenticados" on public.empleados for insert, update, delete using (auth.role() = 'authenticated');

alter table public.tarifas enable row level security;
create policy "lectura tarifas autenticados" on public.tarifas for select using (auth.role() = 'authenticated');
create policy "modificar tarifas autenticados" on public.tarifas for insert, update, delete using (auth.role() = 'authenticated');

alter table public.registros_diarios enable row level security;
create policy "lectura registros autenticados" on public.registros_diarios for select using (auth.role() = 'authenticated');
create policy "insert registros autenticados" on public.registros_diarios for insert with check (auth.role() = 'authenticated');
create policy "update registros autenticados" on public.registros_diarios for update using (auth.role() = 'authenticated');
create policy "delete registros autenticados" on public.registros_diarios for delete using (auth.role() = 'authenticated');

-- Note: para roles diferenciados admin/encargado, use custom claims en JWT o funciones adicionales.
