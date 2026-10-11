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

## Contratos de base y RLS

Después de aplicar todas las migraciones del proyecto hasta la 020 en una base
aislada y provisionar al menos un usuario Auth, ejecutar el script dentro de una
transacción que siempre termina en `ROLLBACK`:

```powershell
$env:PGOPTIONS='-c petstock.environment=e2e'
$env:PGDATABASE='postgresql://postgres:...@.../postgres'
npm run test:db:isolated
```

El script comprueba matriz anon/authenticated, rechazo de escritura directa, compra
`10 × 20 kg`, precisión de las cuatro modalidades de venta, último costo de compra,
snapshots e inmutabilidad histórica, lectura de rentabilidad, rollback por stock
insuficiente, validaciones, atomicidad de merma/ajuste y reconciliación del Kardex.
