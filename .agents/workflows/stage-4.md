---
description: 
---

# Workflow Automatizado: Stage 04 - Control de Mermas y Ajustes de Stock

## ROL 1: [Orquestador]
1. Lee `.antigravity/stages/stage-04-movements.md` y `.antigravity/RULES.md`.
2. Diseña las estructuras y lógica para el Kardex de inventario, registro de Mermas (pérdidas) y Ajustes manuales.
3. DELEGA AUTOMÁTICAMENTE al [Backend].

## ROL 2: [Backend]
1. Implementa `src/services/inventory.ts`.
2. Crea las funciones para registrar Mermas (exigiendo motivo obligatorio) y Ajustes de inventario (diferencia entre stock físico y sistema).
3. Inserta cada evento en `inventory_movements`.
4. Pasa al [Reviewer].

## ROL 3: [Reviewer]
1. Revisa que el signo de los movimientos sea correcto (mermas y egresos con signo negativo) y que no se puedan guardar mermas sin motivo.
2. Pasa al [Tester].

## ROL 4: [Tester]
1. Crea/actualiza un test en Playwright (`tests/movements.spec.ts`) para verificar el registro de mermas y ajustes manuales de stock.
2. Ejecuta el test desde la consola:
   `npx playwright test tests/movements.spec.ts`
3. Valida que el formulario impida guardar una merma sin especificar el motivo obligatorio y que el descuento de stock se refleje en el Kardex.

## ROL 5: [Frontend]
1. Lee `.antigravity/skills/frontend-design/SKILL.md` para aplicar el sistema visual PetStock.
2. Construye los componentes visuales:
   - Formulario de Mermas con motivo obligatorio y badge de alerta en rojo/ámbar (`bg-red-50 text-red-700`).
   - Tabla comparativa de Stock Físico vs Sistema con la misma línea estética (encabezados en mayúsculas `bg-slate-50`, bordes finos y tarjetas contenedoras blancas).