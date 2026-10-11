---
description: 
---

# Workflow Automatizado: Stage 05 - Dashboard y Reportes de Rentabilidad

## ROL 1: [Orquestador]
1. Lee `.antigravity/stages/stage-05-analytics.md` y `.antigravity/RULES.md`.
2. Diseña las consultas y métricas requeridas: Ventas del día, Métodos de Pago, Ganancia Bruta, Alerta de Stock Bajo (`Stock <= Min_Stock`) y Reporte de Movimientos.
3. Entrega y valida sin persistir la migración `supabase/migrations/202610100008_stage_05_analytics_contract.sql` y el contrato `.antigravity/stages/stage-05-architecture.md`.
4. DELEGA AUTOMÁTICAMENTE al [Backend].

## ROL 2: [Backend]
1. Aplica la migración preparada y regenera `src/types/database.types.ts`.
2. Crea `src/services/reportService.ts`, siguiendo la convención vigente de nombres de servicios y validando las respuestas RPC desde `unknown`.
3. Implementa las consultas optimizadas a Supabase para obtener las métricas del día y reportes filtrables por período.
4. Pasa al [Reviewer].

## ROL 3: [Reviewer]
1. Verifica la precisión de los totales consolidados y asegura que las consultas a Supabase sean eficientes.
2. Verifica zona horaria, límites inclusivos, costo histórico, permisos `authenticated`, RLS, tipos sin `any` y planes de consulta.
3. Ejecuta los advisors de seguridad/rendimiento después de aplicar la migración y documenta advertencias aceptadas.
4. Pasa al [Frontend].

## ROL 4: [Frontend]
1. Lee `.agents/skills/frontend-design/SKILL.md` para aplicar el sistema visual PetStock.
2. Construye el **Dashboard Principal**:
   - Tarjetas de resumen en la parte superior (Ventas del día, Ventas del período, Ganancia bruta) con indicadores de variación porcentual en verde/rojo.
   - Componente destacado de **Productos con stock bajo** con botón/link de acción "Ver detalle".
   - Gráfico de línea de resumen de ventas y listas compactas para "Últimas ventas" y "Últimas compras".
   - Tablas de reporte de rentabilidad con badges de margen (%).
3. Cuando la interfaz esté implementada, pasa al [Tester].

## ROL 5: [Tester]
1. Actualiza los mocks RPC y adapta `tests/home-dashboard.spec.ts` al nuevo inicio.
2. Crea `tests/dashboard.spec.ts` para verificar las tarjetas de métricas diarias, los reportes, filtros, estados vacíos y las alertas de stock bajo.
3. Ejecuta primero el test del módulo y luego la suite completa, siempre con la interfaz implementada:
   - `npx playwright test tests/dashboard.spec.ts`
   - `npx playwright test`
4. Si los tests pasan en verde, aprueba el módulo para cierre de la etapa.
