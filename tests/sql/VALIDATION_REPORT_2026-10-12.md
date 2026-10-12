# Validación SQL 018–020 — 2026-10-12

## Alcance y entorno

- PostgreSQL/Supabase local descartable: `public.ecr.aws/supabase/postgres:17.11.0.004`.
- Puerto publicado sólo en `127.0.0.1:55432`.
- Base: `petstock_e2e_20261011`.
- Se usó el fixture sintético pre-001; no se usaron credenciales, datos ni servicios de Supabase real.
- Las migraciones versionadas no reconstruyen una base vacía: 001 presupone tablas de negocio.

## Origen y correcciones

La falla original archivo/merma provenía de leer producto y presentación en una sola
sentencia: bajo `READ COMMITTED`, la operación podía esperar la presentación y conservar
el estado activo de un snapshot anterior. Se separó el bloqueo de presentación de la
relectura bloqueante del producto.

La revisión posterior normalizó el orden de locks a presentación→producto, agregó una
guarda para updates directos, coordinó alta/archivo con un advisory lock transaccional,
impidió eliminar presentaciones de productos inactivos y retiró a `authenticated` el
privilegio de reasignar `product_id`.

## Resultado final

El runner completo terminó con `PASS` sobre baseline sintético, 001–017 y 018–020.

Hashes instalados y comprobados:

- 018: `c5ae2121eca773bc95c0bd5db3b17b82cb9b14f62bde40e20d759fdbb855e4ae`
- 019: `31aed561face8795e9d7016d8b3b90560b2490d61457547e7dc86edd85da8925`
- 020: `a9704c7ffe5348f13068f671a954d1fffe74612fc77e0dfb3e4edcc9b7e3a457`

Se aprobaron las cuatro modalidades de venta, redondeos, último costo de compra,
snapshots históricos, rollback atómico, stock insuficiente, conciliación de Kardex,
restricciones de inactivos y permisos.

Carreras aprobadas: venta/venta, compra/venta, ventas multipresentación en orden inverso,
archivo contra merma, ajuste, venta, compra y update directo, y alta contra archivo con
ambos ganadores. Las operaciones perdedoras devolvieron `INACTIVE_PRODUCT`,
`PRODUCT_NOT_FOUND` o `INSUFFICIENT_STOCK` según contrato, sin efectos parciales.

Verificaciones adicionales:

- Build: PASS.
- Lint: PASS.
- Parser PowerShell: PASS.
- `git diff --check`: PASS.
- E2E segura: 75 PASS, 1 skip esperado de login real, 0 fallas.

## Pendiente obligatorio antes de un entorno real

El resultado anterior demuestra coherencia sobre un esquema mínimo inferido, no
compatibilidad con el esquema real. Antes de aplicar remotamente:

1. Obtener mediante un operador autorizado un dump `schema-only` de `public` cuyo
   historial termine exactamente en 017, sin filas de negocio/Auth/storage ni secretos.
2. Revisar el SQL, calcular SHA-256, almacenarlo cifrado fuera del repositorio y restaurarlo
   en una instancia Supabase descartable.
3. Ejecutar el runner con `-BaselinePath`; no usar `-SyntheticPre001` para este gate.
4. Exigir preflight, postcondiciones, suite transaccional y concurrencia en verde.
5. Confirmar en el destino, en modo sólo lectura, que 018–020 están ausentes, que no hay
   sesiones/bloqueos prolongados y que stock/Kardex, totales y costos son conciliables.
6. Tomar un respaldo verificable, pausar escrituras y aplicar 018→019→020 en ese orden,
   cada archivo en su propia transacción con timeouts y postcondiciones acordados.
7. Verificar firmas, triggers, policies, grants, hashes e integridad antes de reanudar
   escrituras; desplegar después el cliente que dependa de los nuevos snapshots.

Si 018 o 019 ya fue aplicada en algún entorno, no se debe reemplazar silenciosamente su
archivo ni alterar el historial: corresponde generar una migración correctiva nueva.

