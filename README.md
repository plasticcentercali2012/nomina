# Plastic Center Cali - Sistema de Nómina PWA

## Descripción
Aplicación PWA para reemplazar la planilla física de nómina de Plastic Center Cali. Incluye:
- Login seguro con Supabase Auth.
- Roles `admin`, `encargado` y `gerencial`.
- Panel de carga diaria para registro rápido de pesajes.
- Dashboard administrativo con consolidado semanal, gestión de empleados y tarifas.
- PWA instalable en celular y PC.

## Estructura de carpetas

- `src/`
  - `components/` - componentes UI compartidos.
  - `hooks/` - hooks personalizados como `useAuth`.
  - `lib/` - cliente Supabase.
  - `pages/` - vistas principales (`LoginPage`, `CargaDiariaPage`, `AdminDashboardPage`).
  - `types.ts` - tipos de datos de la aplicación.
- `supabase-schema.sql` - esquema SQL para Supabase con tablas y RLS.

## Instalación

1. Ejecuta `npm install`.
2. Crea un proyecto Supabase y agrega las variables de entorno en `.env`:
   ```env
   VITE_SUPABASE_URL=https://xyzcompany.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
3. Ejecuta `npm run dev`.

## Configuración Supabase

1. Crea `usuarios_sistema`, `empleados`, `tarifas` y `registros_diarios`.
2. Ejecuta `supabase-schema.sql` en SQL editor.
3. Habilita RLS en las tablas y revisa que `auth.role() = 'authenticated'` sea aceptado.
4. Configura Supabase Auth con correo y contraseña.

## Flujo de usuario

- `encargado`: accede a `/carga-diaria`, registra pesajes por fecha, empleado, proceso y material.
- `admin`: accede a `/admin`, revisa consolidado semanal, actualiza tarifas y administra empleados.
- `gerencial`: accede a `/admin` en modo de consulta y únicamente visualiza Consolidado y Analítica.

Para una base de datos existente, ejecuta `supabase-gerencial-role.sql` en Supabase SQL Editor. La migración agrega el rol y restringe mediante RLS las operaciones de escritura a los roles autorizados.

La migración `supabase/migrations/20260731120000_flujo_materiales_encadenado.sql` agrega la configuración de lavado y aglutinado por material. Debe aplicarse antes de usar el registro enlazado de producción.

La migración `supabase/migrations/20260731150000_ajuste_soplado_diario.sql` crea el ajuste único de soplado por fecha y proceso, junto con el permiso para que el encargado lo corrija únicamente durante la jornada actual.

## Impresión térmica ESC/POS

Los comprobantes se envían como comandos ESC/POS nativos mediante QZ Tray; no utilizan PDF ni la impresión HTML del navegador. En el computador conectado a la impresora:

1. Instala y abre QZ Tray 2.2 o superior desde `https://qz.io/download/`.
2. Abre Consolidado y pulsa **Configurar impresora**.
3. Selecciona la impresora térmica instalada en Windows.
4. En la primera conexión, autoriza el acceso solicitado por QZ Tray y marca la opción para recordar la decisión.

La selección queda guardada localmente en ese navegador. El recibo usa Font A, 32 columnas y codificación CP850 para español.

## Despliegue

Se recomienda Vercel o Netlify en su plan gratuito:
1. Configura el repositorio.
2. Añade variables de entorno `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Usa el comando de build `npm run build`.

## Notas de seguridad

- El backend asume uso de Supabase Auth.
- Las políticas RLS deben ajustarse si necesitas diferenciar admin vs encargado en la base de datos.
- Para producción, agrega validación adicional de roles y control de acceso en el frontend.
