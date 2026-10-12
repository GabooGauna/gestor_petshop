# Avenida Animal QA

La suite segura usa respuestas Supabase simuladas para validar login, POS, compras,
mermas, ajustes y Kardex sin escribir en ninguna base:

```powershell
npm run test:e2e:safe
```

Playwright necesita un navegador compatible. La opción preferida es instalar su
Chromium administrado una vez:

```powershell
npx playwright install chromium
```

En entornos donde no se permiten descargas, se puede reutilizar Chrome o Edge local
sin cambiar la configuración versionada:

```powershell
$env:PLAYWRIGHT_BROWSER_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:e2e:safe
```

La configuración muestra progreso en consola y genera el informe HTML sin abrir un
servidor interactivo, para que las ejecuciones automatizadas siempre finalicen.

Las verificaciones reales de solo lectura requieren `E2E_EMAIL` y `E2E_PASSWORD`.
Copiar `.env.e2e.example` a un archivo local no versionado y usar una cuenta dedicada.

Los tests antiguos de catálogo que crean registros están bloqueados salvo que existan
simultáneamente `E2E_ISOLATED=true`, `E2E_MUTATIONS=isolated-only`, `E2E_RUN_ID` y las
credenciales E2E. Esta confirmación no reemplaza el aislamiento: el proyecto apuntado
debe ser descartable y nunca la base compartida.

## Contratos de base, migraciones y concurrencia

Las migraciones versionadas no reconstruyen una base vacía: `001` ya presupone las
tablas transaccionales. Hasta recuperar el esquema inicial, el punto de partida seguro
es un dump SQL **schema-only**, revisado y sin datos, de un entorno compatible cuyo
historial termine exactamente en `017`. No se versiona ese dump porque puede contener
metadatos propios del entorno. La opción preferida es una rama/clone descartable de
Supabase; como alternativa, un operador autorizado puede producir el dump con una
credencial temporal de sólo lectura, guardarlo cifrado fuera del repositorio y eliminarlo
al terminar. Nunca se copian filas de `auth`, negocio ni secretos.

Usar una instancia local/descartable compatible con Supabase que ya provea la función
`auth.uid()` y los roles sin login `anon` y `authenticated`. No alcanza con crear una
base PostgreSQL vacía: el runner comprueba esos prerrequisitos y se detiene antes de
restaurar si faltan; deliberadamente no crea roles globales ni shims de autenticación.
El baseline debe contener sólo el esquema de aplicación (`public`) hasta la 017, no
volver a definir el runtime `auth` de la instancia. Crear una base preprovisionada o
clonada desde una plantilla local cuyo nombre empiece con `petstock_e2e_` o `petstock_test_`,
configurar la contraseña mediante un `PGPASSFILE` temporal (no en la URL ni en `.env`)
y ejecutar:

```powershell
$env:PGOPTIONS='-c petstock.environment=e2e'
$env:PGPASSFILE='C:\ruta\temporal\pgpass.conf'
npm run test:db:isolated -- `
  -Connection 'host=127.0.0.1 port=5432 dbname=petstock_e2e_20261011 user=postgres' `
  -BaselinePath 'C:\ruta\segura\petstock_schema_through_017.sql'
```

El runner se niega a usar hosts no locales, nombres de base no descartables, URLs con
contraseña, un baseline con `COPY`/`INSERT`, o una base que ya contiene las tablas de
negocio. Ejecuta un preflight de dependencias y discrepancias; aplica `018`, `019` y
`020` secuencialmente, cada una dentro de su propia transacción junto con su
postcondición y registro SHA-256; nunca usa `psql -f` en autocommit.

Luego ejecuta la prueba transaccional existente y carreras reales con dos conexiones:
venta/venta, compra/venta, archivo contra merma, ajuste, venta, compra y edición directa,
alta de presentación contra archivo con ambos ganadores, y ventas multipresentación en
orden inverso. También cubre las cuatro modalidades, stock exacto/insuficiente,
redondeos, último costo, snapshots históricos, productos inactivos, permisos y
reconciliación de Kardex. Todo el entorno se considera descartable y se elimina completo
después de guardar el informe.

### Fixture sintético pre-001

Para comprobar además la cadena `001`–`017` existe
`tests/sql/synthetic_pre_001_baseline.sql`. Es exclusivamente infraestructura de test:
no es un baseline canónico, no reconstruye con certeza el esquema histórico y nunca
debe aplicarse a producción. Contiene sólo el esquema mínimo inferido y las filas
sintéticas exactas que la reconciliación 003 exige por UUID y valor. Requiere una imagen
Supabase que ya provea `anon`, `authenticated` y `auth.uid()`; no emula ese runtime.
Como 005 exige al menos un usuario Auth, el runner crea un UUID sintético justo antes
de esa migración y lo elimina inmediatamente después, verificando la limpieza.

Con `psql` local:

```powershell
$env:PGOPTIONS='-c petstock.environment=e2e'
npm run test:db:isolated -- `
  -Connection 'host=127.0.0.1 port=5432 dbname=petstock_e2e_synthetic user=postgres' `
  -SyntheticPre001
```

Si `psql` sólo está disponible dentro del contenedor descartable, el runner puede
invocarlo mediante `docker exec -i` (el contenedor ya debe estar iniciado y la base
descartable creada):

```powershell
$env:PGOPTIONS='-c petstock.environment=e2e'
npm run test:db:isolated -- `
  -Connection 'dbname=petstock_e2e_synthetic user=postgres' `
  -SyntheticPre001 `
  -DockerContainer 'supabase_db_petstock_test'
```

### Actualización desde el esquema remoto actual

Cuando el remoto ya tiene 018 y 019 históricas y 020 está pendiente, no se reutiliza el
runner pre-017 ni se reaplican esas migraciones. Generar primero un dump `schema-only`
de `public` en formato custom, revisar su TOC y producir además el SQL plano. Ninguno de
los dos archivos se versiona.

La base descartable debe clonarse desde una plantilla Supabase para conservar roles,
`auth.uid()`, extensiones y ACL. El usuario que restaura necesita privilegios locales
suficientes para los `ALTER DEFAULT PRIVILEGES` del dump. Ejecutar:

```powershell
$env:PGOPTIONS='-c petstock.environment=e2e'
npm run test:db:current-upgrade -- `
  -Connection 'dbname=petstock_e2e_current_20261012 user=postgres' `
  -BaselinePath 'C:\ruta\temporal\petstock-public-current.sql' `
  -BaselineTocPath 'C:\ruta\temporal\petstock-public-current.toc' `
  -DockerContainer 'petstock_db_current_upgrade_20261012'
```

Este runner exige el fingerprint histórico real, carga fixtures de preservación,
aplica 020 y la correctiva 021 en transacciones independientes, comprueba sus
postcondiciones y vuelve a ejecutar contratos y carreras concurrentes. La evidencia y
el runbook de producción están en
`tests/sql/REAL_SCHEMA_VALIDATION_2026-10-12.md`.
