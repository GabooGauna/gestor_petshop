# Validación contra esquema real — migración 022

Fecha: 2026-10-12 (America/Buenos_Aires)

## Estado remoto previo (sólo lectura)

- PostgreSQL remoto: 17.11.
- `20261012154544_last_purchase_cost_snapshot` (020): aplicada.
- `20261012154611_reconcile_historical_transaction_hardening` (021): aplicada.
- `logical_presentation_lifecycle` (022): ausente.
- `product_presentations.status`, las RPC `archive_presentation` /
  `reactivate_presentation` y el trigger de ciclo de vida: ausentes, sin instalación
  parcial.
- Preflight remoto: `status=ready`, 9 presentaciones, 3 ventas, 9 compras, 16
  movimientos y cero transacciones largas.
- Integridad previa: cero stock negativo, diferencias stock/Kardex, diferencias de
  último costo de compra, diferencias de totales de venta y referencias huérfanas.
- Se conservaron los cinco ítems de venta históricos anteriores a 020 con snapshots
  nulos; son legado conocido y 022 no intenta reescribirlos.

Este bloque se completó antes del despliegue, sin DDL ni DML comercial.

## Respaldo y restauración

Respaldo fuera del repositorio:

`C:\Users\gauna\AppData\Local\PetStock\Backups\pre-022-20261012-170048`

- Archive custom cifrado: `petstock-public-pre022.dump.dpapi`
- PostgreSQL origen / herramienta: 17.11 / 17.11.
- SHA-256 del archive: `29c1d34604db9edf57b33ae12417c32cf1ab806c1bf3e3f683b5b4a417108810`.
- TOC: 174 entradas y exactamente 9 entradas `TABLE DATA` para las nueve tablas
  PetStock de `public`.
- Revisión: sin objetos `auth`/`storage`, URLs con credenciales ni secretos.
- ACL sin herencia: acceso sólo para `Gabo\gauna`, `SYSTEM` y administradores.

El host no ofrece EFS y la unidad C: no tiene BitLocker. El archive se cifró con
Windows DPAPI, alcance `CurrentUser`, y se verificó descifrándolo en memoria: el
SHA-256 recuperado coincide con el archive original. La copia sin cifrar, el SQL plano,
la credencial temporal y los contenedores descartables fueron eliminados. La
recuperación requiere el mismo perfil de Windows y la entropía documentada en el
runbook.

La copia se restauró en `petstock_e2e_current_022` sobre la imagen
`public.ecr.aws/supabase/postgres:17.11.0.004`. La restauración reprodujo los conteos
reales: 6 categorías, 2 proveedores, 9 productos, 9 presentaciones, 3 ventas, 5 ítems
de venta, 9 compras, 9 ítems de compra y 16 movimientos.

## Ensayo de 022 sobre la copia real

- Se aplicó únicamente `202610120022_logical_presentation_lifecycle.sql`.
- SHA-256 de 022: `5d24bd974c692d77ca3306b7d3abb9b6e3e2394c98c4b3121c161e9405147278`.
- Las 9 presentaciones preexistentes quedaron `active`.
- Conteos, sumas de stock, costos, ventas, compras y movimientos permanecieron
  idénticos antes y después de 022.
- Permisos aprobados: `anon` sin RPC; `authenticated` con RPC de ciclo de vida;
  actualización directa de `status`, stock, costo y producto denegada; edición de
  campos comerciales permitida.
- Archivado conservó stock/costo y bloqueó venta por importe, peso, bulto y unidad,
  además de compra, ajuste y merma.
- Reactivación conservó stock/costo y volvió a habilitar la presentación.
- Kardex y reportes de rentabilidad/movimientos conservaron la identidad histórica.
- Dashboard y bajo stock excluyeron presentaciones archivadas del stock operativo.
- Carreras archivo↔venta/compra/ajuste/merma y orden inverso multi-presentación:
  aprobadas, con bloqueo por fila y sin deadlocks ni mutaciones parciales.

Resultado del runner: `PASS: current 020/021 backup plus migration 022,
preservation, lifecycle and concurrency contracts.`

## Aplicación y frontend

- `npm run build`: aprobado.
- `npm run lint`: aprobado.
- E2E aislado de ciclo de vida: 5/5 aprobado.
- Suite E2E segura completa, con `dotenv` deshabilitado, URL local ficticia y backend
  simulado: 80 aprobadas, 1 omitida (login real), 0 fallas.
- Orden obligatorio: aplicar 022 y postcondiciones; después publicar el frontend.
  El frontend nuevo consulta `product_presentations.status`. Durante la ventana, el
  frontend anterior sigue siendo compatible porque `delete_presentation` pasa a ser
  alias de archivado.

## Despliegue real

- Mantenimiento confirmado por el usuario antes de la escritura.
- Última guarda: 020/021 presentes, 022 pendiente, cero escritores y cero
  transacciones activas.
- Migración aplicada mediante MCP: `20261012201823_logical_presentation_lifecycle`.
- No se reaplicó ni modificó ninguna migración histórica.
- `postconditions_022.sql` y `production_postdeploy_022.sql`: aprobados en lectura.
- Resultado postdeploy: 9 presentaciones activas, 0 inactivas, 0 stock archivado, 3
  ventas, 9 compras y 16 movimientos.
- Conteos y sumas de stock, costos, ventas, compras y movimientos coinciden con el
  fingerprint previo.
- Fingerprint fila por fila de las nueve presentaciones, excluyendo la nueva columna
  de ciclo de vida: `b895b6caacf2b8c63553ab206822fc9a` antes y después.
- RLS, trigger, RPC y permisos de columna: aprobados.
- Rentabilidad y movimientos históricos permanecen independientes del estado; sólo
  dashboard/bajo stock filtra presentaciones activas.
- Advisors sin errores nuevos. Los avisos de RPC `SECURITY DEFINER` son intencionales
  y el índice nuevo aparece como no usado por haberse creado durante esta ventana.

## Conclusión

La migración 022 quedó aplicada y validada en producción. La base está lista para el
frontend Stage 06. La reapertura de clientes queda condicionada a publicar ese build y
completar los smokes autenticados de sólo lectura.
