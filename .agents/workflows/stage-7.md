---
description: Stock mínimo configurable por presentación y alertas de reposición
---

# Workflow: Stage 07 - Stock mínimo y alertas

## ROL 1: [Orquestador]

1. Lee el stage, reglas y contratos vigentes de catálogo, inventario y Dashboard.
2. Define columna, backfill, validaciones, compatibilidad RPC y criterio único de alerta.
3. Prepara la migración 023 y pruebas SQL sin aplicarlas a Supabase real.
4. Entrega contratos a Backend.

## ROL 2: [Backend]

1. Implementa 023 preservando stock, Kardex, costos e históricos.
2. Actualiza tipos y servicios para crear y editar el mínimo por presentación.
3. Mantiene compatibilidad durante el despliegue escalonado y errores estables.
4. Ejecuta pruebas SQL aisladas cuando exista un entorno desechable y entrega a Reviewer.

## ROL 3: [Reviewer]

1. Audita restricciones numéricas, RLS, privilegios y ciclo de vida.
2. Verifica que no exista el piso implícito de cinco ni mezcla de kg con unidades.
3. Confirma que editar el mínimo no genere movimientos ni afecte cálculos históricos.
4. Entrega los contratos aprobados a Frontend.

## ROL 4: [Frontend]

1. Lee `.agents/skills/frontend-design/SKILL.md`.
2. Incorpora mínimos en creación y edición con ayuda contextual y validación accesible.
3. Unifica el criterio visual de Home, Catálogo e Inventario.
4. Mantiene el lenguaje visual existente y entrega la interfaz completa a Tester.

## ROL 5: [Tester]

1. Cubre mínimos 0 a 5 y superiores, unidad, peso y múltiples presentaciones.
2. Valida cruces del umbral por compra, venta, ajuste y merma sin operaciones reales.
3. Ejecuta pruebas focalizadas, build, lint y regresión E2E completa.
4. Documenta resultados y deja migración y despliegue pendientes de autorización.
