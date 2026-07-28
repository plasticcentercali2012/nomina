-- Supabase SQL schema para Plastic Center Cali Nómina

-- Tabla usuarios de acceso
create table if not exists public.usuarios_sistema (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  rol text not null check (rol in ('admin', 'encargado', 'gerencial')),
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
create policy "modificar empleados autenticados" on public.empleados for all using (auth.role() = 'authenticated');

alter table public.tarifas enable row level security;
create policy "lectura tarifas autenticados" on public.tarifas for select using (auth.role() = 'authenticated');
create policy "modificar tarifas autenticados" on public.tarifas for all using (auth.role() = 'authenticated');

alter table public.registros_diarios enable row level security;
create policy "lectura registros autenticados" on public.registros_diarios for select using (auth.role() = 'authenticated');
create policy "insert registros autenticados" on public.registros_diarios for insert with check (auth.role() = 'authenticated');
create policy "update registros autenticados" on public.registros_diarios for update using (auth.role() = 'authenticated');
create policy "delete registros autenticados" on public.registros_diarios for delete using (auth.role() = 'authenticated');

-- Tabla de pagos adicionales semanales por empleado
create table if not exists public.pagos_adicionales (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references public.empleados(id) on delete cascade,
  semana_inicio date not null,
  descripcion text not null,
  valor numeric not null,
  created_at timestamptz not null default now()
);

alter table public.pagos_adicionales enable row level security;
create policy "lectura pagos adicionales autenticados" on public.pagos_adicionales for select using (auth.role() = 'authenticated');
create policy "insert pagos adicionales autenticados" on public.pagos_adicionales for insert with check (auth.role() = 'authenticated');
create policy "update pagos adicionales autenticados" on public.pagos_adicionales for update using (auth.role() = 'authenticated');
create policy "delete pagos adicionales autenticados" on public.pagos_adicionales for delete using (auth.role() = 'authenticated');

-- Tablas de nómina histórica para guardar datos semanales y mensuales
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

alter table public.nominas_semanales enable row level security;
create policy "lectura nominas semanales autenticados" on public.nominas_semanales for select using (auth.role() = 'authenticated');
create policy "insert nominas semanales autenticados" on public.nominas_semanales for insert with check (auth.role() = 'authenticated');
create policy "update nominas semanales autenticados" on public.nominas_semanales for update using (auth.role() = 'authenticated');
create policy "delete nominas semanales autenticados" on public.nominas_semanales for delete using (auth.role() = 'authenticated');

create table if not exists public.nominas_mensuales (
  id uuid primary key default gen_random_uuid(),
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  empleado_id uuid references public.empleados(id) on delete cascade,
  total_kg numeric not null,
  pago_adicional numeric not null,
  total_pagar numeric not null,
  created_at timestamptz not null default now(),
  unique (anio, mes, empleado_id)
);

alter table public.nominas_mensuales enable row level security;
create policy "lectura nominas mensuales autenticados" on public.nominas_mensuales for select using (auth.role() = 'authenticated');
create policy "insert nominas mensuales autenticados" on public.nominas_mensuales for insert with check (auth.role() = 'authenticated');
create policy "update nominas mensuales autenticados" on public.nominas_mensuales for update using (auth.role() = 'authenticated');
create policy "delete nominas mensuales autenticados" on public.nominas_mensuales for delete using (auth.role() = 'authenticated');

-- Note: para roles diferenciados admin/encargado, use custom claims en JWT o funciones adicionales.
