---
description: 
---

# Workflow Automatizado: Stage 05 - Dashboard y Reportes de Rentabilidad

## ROL 1: [Orquestador]
1. Lee `.antigravity/stages/stage-05-analytics.md` y `.antigravity/RULES.md`.
2. Diseña las consultas y métricas requeridas: Ventas del día, Métodos de Pago, Ganancia Bruta, Alerta de Stock Bajo (`Stock <= Min_Stock`) y Reporte de Movimientos.
3. DELEGA AUTOMÁTICAMENTE al [Backend].

## ROL 2: [Backend]
1. Crea `src/services/reports.ts`.
2. Implementa las consultas optimizadas a Supabase para obtener las métricas del día y reportes filtrables por período.
3. Pasa al [Reviewer].

## ROL 3: [Reviewer]
1. Verifica la precisión de los totales consolidados y asegura que las consultas a Supabase sean eficientes.
2. Pasa al [Tester].

## ROL 4: [Tester]
1. Crea un test E2E (`tests/dashboard.spec.ts`) que verifique la visualización de las tarjetas de métricas diarios y las alertas de Stock Bajo.
2. Ejecuta la suite completa de calidad: `npx playwright test`
3. Si los tests pasan en verde, aprueba el módulo para cierre de la etapa.

## ROL 5: [Frontend]
1. Lee `.antigravity/skills/frontend-design/SKILL.md` para aplicar el sistema visual PetStock.
2. Construye el **Dashboard Principal**:
   - Tarjetas de resumen en la parte superior (Ventas del día, Ventas del período, Ganancia bruta) con indicadores de variación porcentual en verde/rojo.
   - Componente destacado de **Productos con stock bajo** con botón/link de acción "Ver detalle".
   - Gráfico de línea de resumen de ventas y listas compactas para "Últimas ventas" y "Últimas compras".
   - Tablas de reporte de rentabilidad con badges de margen (%).