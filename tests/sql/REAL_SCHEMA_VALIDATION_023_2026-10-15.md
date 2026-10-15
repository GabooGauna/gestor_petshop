# Validación contra esquema y datos reales — migración 023

Fecha: 2026-10-15 (America/Buenos_Aires)

## Estado remoto previo, sólo lectura

- PostgreSQL 17.11.
- 020 `last_purchase_cost_snapshot`: aplicada.
- 021 `reconcile_historical_transaction_hardening`: aplicada.
- 022 `logical_presentation_lifecycle`: aplicada.
- 023 `configurable_presentation_min_stock`: pendiente.
- `product_presentations.status` está presente; `product_presentations.min_stock` y
  la RPC de ocho argumentos todavía están ausentes.
- Conteos: 9 productos, 9 presentaciones, 4 ventas, 9 compras y 18 movimientos.
- Estado histórico: 8 productos activos y 1 archivado; una presentación pertenece al
  producto archivado. Las 9 presentaciones mantienen estado activo.
- Cero mínimos heredados inválidos, diferencias stock/Kardex, diferencias en totales
  de venta y transacciones largas.

No se ejecutó DDL ni DML comercial en Supabase remoto.

## Credencial y respaldo

El historial persistente de la consola del intento anterior se vació sin leer su
contenido. La nueva contraseña se capturó en una ventana nativa ejecutada con
`-NoProfile -File` y `Read-Host -AsSecureString`; no pasó por una línea de comandos,
salida, log ni archivo del repositorio.

El `.pgpass` temporal se creó fuera del proyecto con ACL sin herencia y acceso sólo
para el usuario, SYSTEM y administradores. Se comprobó por metadatos, sin leer su
contenido, y se eliminó automáticamente después de `pg_dump`.

Respaldo conservado fuera de Git:

`C:\Users\gauna\AppData\Local\PetStock\Backups\pre-023-20261015-162357`

- Archive cifrado: `petstock-public-pre023.dump.dpapi`.
- SHA-256 del archive plano verificado:
  `6bb50d5846f20f31106d378bf0e1208ec1945990681c6183535bdd1d83a51a6d`.
- PostgreSQL origen y herramienta: 17.11.
- Alcance: estructura y datos de `public`; exactamente nueve tablas `TABLE DATA`.
- Cifrado: Windows DPAPI `CurrentUser`, entropía
  `PetStock migration 023 backup v1`.
- Se verificó el descifrado en memoria contra SHA-256.
- El dump plano, la credencial temporal y los contenedores se eliminaron.

## Ensayo restaurado

El archive se restauró en `petstock_e2e_current_023` dentro de
`public.ecr.aws/supabase/postgres:17.11.0.004`, sin publicar puertos. La base sólo
incorporó localmente el shim mínimo `auth.uid()` requerido por el runtime Supabase.
La restauración se ejecutó con `supabase_admin` para conservar las ACL y privilegios
predeterminados de los roles reales.

La primera ejecución útil encontró un defecto real: el backfill hacía un `UPDATE`
sobre todas las presentaciones y el trigger de 021 rechazaba la fila cuyo producto
está archivado con `INACTIVE_PRODUCT`. La transacción local revirtió íntegramente.

Corrección aplicada a 023:

- exige que los guards de 021 y 022 existan y estén habilitados;
- deshabilita únicamente esos dos triggers durante el backfill, dentro de la misma
  transacción y bajo el bloqueo de `ALTER TABLE`;
- copia también el mínimo histórico de filas archivadas;
- rehabilita ambos triggers antes de continuar;
- las postcondiciones comprueban que los guards y el nuevo trigger queden habilitados.

SHA-256 final de 023:

`258eaa7600ea46a4949f5479fa27081d8563a6cf18df627b00b66f04ad38abf2`

## Resultados SQL

- Preflight del esquema 020/021/022: aprobado.
- Aplicación transaccional exclusiva de 023: aprobada.
- Backfill: 9/9 presentaciones copiaron exactamente el mínimo de su producto,
  incluida la asociada al producto archivado.
- Preservación fila por fila: categorías, proveedores, productos, presentaciones
  —sin la nueva columna—, ventas, compras, ítems y movimientos sin cambios.
- Conteos y sumas de stock, costos, ventas, compras y Kardex sin cambios.
- `postconditions_023.sql`: aprobado.
- `production_postdeploy_023.sql`: aprobado.
- Mínimos 0, 1, 2, 3, 4, 5 y superiores: aprobados.
- Unidad entera y rechazo de fracciones: aprobado.
- Peso decimal hasta tres posiciones: aprobado.
- Presentaciones archivadas excluidas de alertas y operaciones: aprobado.
- Contratos transaccionales de venta, compra, ajuste y merma: aprobados.
- Carreras concurrentes, incluida edición de mínimo contra compra: aprobadas, sin
  deadlocks ni mutaciones parciales.
- Contratos de ciclo de vida y permisos: aprobados.

Resultado del runner:

`PASS: current 020/021/022 backup plus migration 023, preservation, lifecycle, minimum-stock and concurrency contracts.`

## Frontend y regresión

- `npm run build`: aprobado.
- `npm run lint`: aprobado.
- E2E segura con Chrome local, dotenv deshabilitado y Supabase ficticio:
  82 aprobadas, 1 omitida —login real—, 0 fallas.
- Tipos TypeScript y servicio usan la firma RPC de ocho argumentos y serializan los
  decimales compatibles con PostgreSQL.
- Dashboard, catálogo e inventario comparten `stock <= min_stock`, respetan unidades
  y excluyen presentaciones inactivas.
- ExcelJS permanece cargado mediante `await import('exceljs')` en un chunk separado;
  no se realizó optimización adicional.

## Conclusión del ensayo previo

La migración 023 está lista para producción, condicionada al runbook: pausa de
escritores, preflight y respaldo final, aplicación explícitamente autorizada,
postcondiciones y publicación del frontend sólo después del DDL. No hubo commit, push,
aplicación remota ni despliegue de Vercel durante esta validación.

## Despliegue controlado en producción

Autorización recibida y ejecución completada el 2026-10-15.

- El preflight remoto confirmó 020, 021 y 022 aplicadas y 023 ausente.
- No había clientes activos, transacciones largas ni escritores comerciales.
- La pausa se hizo revocando temporalmente `USAGE` de `public` a `PUBLIC`. Se
  verificó que `authenticated` no pudiera usar el esquema antes de continuar; `anon`
  y `service_role` conservaron sus grants explícitos.
- El respaldo cifrado anterior se restauró otra vez en Docker. Sus nueve tablas,
  conteos, sumas y fingerprints coincidieron exactamente con producción, por lo que
  seguía siendo un punto de recuperación vigente y no fue necesario generar otro.
- El SHA-256 de la migración volvió a comprobarse como
  `258eaa7600ea46a4949f5479fa27081d8563a6cf18df627b00b66f04ad38abf2`.
- Se aplicó exclusivamente `configurable_presentation_min_stock` mediante una única
  migración transaccional. Supabase la registró como versión `20261015194714`.
- Los guards de 021 y 022 sólo estuvieron suspendidos dentro de la transacción que
  retenía el bloqueo exclusivo; los tres triggers requeridos quedaron habilitados
  antes del commit.
- `postconditions_023.sql` y `production_postdeploy_023.sql` aprobaron en modo de
  sólo lectura.
- Las nueve presentaciones conservaron identidad y todos los fingerprints previos.
  Conteos finales: 9 presentaciones, 4 ventas, 6 ítems de venta, 9 compras, 9 ítems
  de compra y 18 movimientos. Stock total `140.987` y suma de costos `317200` sin
  variación.
- Las verificaciones de stock/Kardex, último costo de compra y totales/costos de
  ventas devolvieron cero diferencias. Los nueve mínimos históricos se copiaron a
  presentación y no hay mínimos inválidos.
- Columnas, constraints, RPC antigua y nueva, permisos, RLS, función de dashboard y
  triggers aprobaron. Los avisos de seguridad restantes corresponden a las RPC
  `SECURITY DEFINER` intencionales; los avisos de rendimiento son índices existentes
  aún no utilizados.
- Se restauró el grant original de `PUBLIC`; `authenticated`, `anon` y
  `service_role` tienen nuevamente `USAGE` efectivo. La comprobación final encontró
  cero clientes y cero transacciones activas.
- El sitio publicado renovó sesión y leyó categorías, productos y dashboard desde
  Supabase con respuestas HTTP 200 y sin mensajes de consola. La versión publicada
  todavía muestra el mínimo preventivo antiguo de 5; es el frontend de etapa 06 y
  deberá reemplazarse por el frontend ya validado de etapa 07.

No se crearon ventas, compras, ajustes ni movimientos; no se ejecutó restauración.
Tampoco se creó commit, se publicó `main` ni se actualizó Vercel.
