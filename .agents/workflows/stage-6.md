---
description: Baja lógica y reactivación de presentaciones
---

# Workflow: Stage 06 - Ciclo de vida de presentaciones

## ROL 1: [Orquestador]

1. Lee el stage, reglas, migraciones 020/021 y RPC transaccionales vigentes.
2. Define estado, contratos RPC, orden de locks, errores y semántica de reportes.
3. Prepara la migración 022 y pruebas SQL sin aplicarlas a Supabase real.
4. Entrega a Backend.

## ROL 2: [Backend]

1. Valida 022 en un entorno desechable con 020/021 ya presentes; no usa datos reales.
2. Regenera tipos y adapta servicios para archivar/reactivar y filtrar operaciones.
3. Conserva los snapshots y cálculos exactos de 020 en las cuatro modalidades.
4. Ejecuta pruebas SQL funcionales y de concurrencia, luego entrega a Reviewer.

## ROL 3: [Reviewer]

1. Audita RLS, privilegios, triggers, atomicidad, orden de locks y errores.
2. Verifica que no exista `DELETE` físico y que históricos/reportes no filtren por
   estado actual.
3. Revisa precisión y ausencia de regresiones de rentabilidad/integridad.
4. Entrega contratos aprobados a Frontend.

## ROL 4: [Frontend]

1. Lee `.agents/skills/frontend-design/SKILL.md`.
2. Muestra estado en catálogo y ofrece archivar/reactivar con confirmación clara.
3. Excluye inactivas de POS, compras, ajustes, mermas, stock operativo y alertas.
4. Mantiene inactivas visibles en administración e históricos.
5. Entrega la interfaz completa a Tester.

## ROL 5: [Tester]

1. Agrega E2E de archivado/reactivación, filtros operativos e históricos.
2. Ejecuta pruebas de las cuatro modalidades de venta.
3. Ejecuta primero archivos focalizados y después la suite completa.
4. Documenta resultados, riesgos y deja 022 pendiente de autorización remota.

