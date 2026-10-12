# Stage 06 — Informe final de revisión y QA

Fecha: 2026-10-12

Resultado: **aprobado localmente; migración 022 pendiente de autorización y aplicación**.

## Seguridad e integridad

- `authenticated` sólo puede editar directamente `name`, `weight_kg`, `price` y
  `price_per_kg` de presentaciones activas. No puede modificar `status`, `stock`,
  `cost`, identidad ni fecha.
- `archive_presentation` y `reactivate_presentation` son las únicas transiciones de
  estado. `delete_presentation` queda como alias compatible de archivado y ya no
  elimina filas.
- El trigger de ciclo de vida se evalúa una vez adquirido el lock de presentación.
  Una venta, compra, merma o ajuste que pierde la carrera contra el archivado falla
  completa con `INACTIVE_PRESENTATION`, sin cambiar stock, costo ni Kardex.
- Los contratos de último costo y snapshots históricos de 020 permanecen intactos.
  Rentabilidad continúa leyendo `sale_items.cost`, no el costo actual.
- Reportes históricos y Kardex no filtran por estado actual. Alertas y selectores
  operativos sólo incluyen presentaciones activas.

## Validación SQL aislada

Se utilizó un contenedor descartable basado en
`public.ecr.aws/supabase/postgres:17.11.0.004`, con base
`petstock_e2e_stage06`. El runner sintético aplicó 001–022 y fue eliminado al finalizar.

Resultado:

- migraciones 001–022 y postcondiciones: aprobadas;
- cuatro modalidades de venta: aprobadas;
- permisos, RLS, trigger e inmutabilidad: aprobados;
- compra, ajuste y merma sobre archivadas: rechazados atómicamente;
- históricos de rentabilidad y movimientos: preservados;
- carreras archivo/venta/compra/ajuste/merma y operación-ganadora: aprobadas;
- ventas multipresentación en orden inverso: sin deadlock;
- resultado final del runner: `PASS`.

No se conectó ni escribió en Supabase real.

## Validación de aplicación

- `npm run build`: aprobado.
- `npm run lint`: aprobado.
- `git diff --check`: aprobado.
- E2E focalizada de ciclo de vida: 5 aprobadas.
- E2E focalizadas de catálogo, POS, compras e inventario: 35 aprobadas.
- `npm run test:e2e:safe -- --workers=1`: 80 aprobadas, 1 omitida, 0 fallos.

La prueba omitida requiere autenticación real y no se ejecutó para mantener el cierre
aislado. Tampoco se ejecutó la suite global que puede leer el proyecto configurado en
`.env`.

## Condiciones para aplicar 022

1. Tomar respaldo y confirmar que 020 y 021 figuran aplicadas.
2. Verificar que no existan transacciones largas ni escrituras activas durante la
   ventana de migración.
3. Aplicar únicamente `202610120022_logical_presentation_lifecycle.sql`.
4. Ejecutar `postconditions_022.sql` y comprobar grants/RPC/trigger.
5. Desplegar el frontend de Stage 06 después de la migración, porque consulta la nueva
   columna `product_presentations.status`.
6. Realizar smoke tests de archivado/reactivación, las cuatro ventas, compra, ajuste,
   merma, Kardex, reportes y valuación activa/inmovilizada.
7. Ante cualquier discrepancia, detener el despliegue; no corregir datos reales sin
   autorización separada.

Riesgo residual no bloqueante: Vite conserva la advertencia previa por chunks mayores
a 500 kB. No afecta los contratos funcionales de esta etapa.
