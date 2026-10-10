---
description: 
---

# Workflow: Cadena Completa de Desarrollo Automático

## INICIO: Rol [Orquestador]
1. Lee el archivo de la etapa activa (ej. `.antigravity/stages/stage-01-core-db.md`) y `.antigravity/RULES.md`.
2. Diseña la estructura (SQL/Contrato de API) y ejecútala en Supabase si aplica.
3. Una vez completado, DELEGA AUTOMÁTICAMENTE la tarea al Agente Backend indicando los endpoints o modelos creados.

---

## PASO 2: Rol [Backend]
1. Recibe la especificación del Orquestador.
2. Escribe los servicios, funciones TypeScript y consultas de Supabase.
3. Una vez escrito el código, INVOCA AUTOMÁTICAMENTE al Agente Reviewer enviándole el código generado.

---

## PASO 3: Rol [Reviewer]
1. Revisa el código del Backend buscando:
   - Violación de decimales (debe usar NUMERIC/DECIMAL, nunca FLOAT).
   - Uso de `any` en TypeScript.
2. Si encuentra errores, SE LO DEVUELVE al Backend con las correcciones.
3. Si el código es correcto, INVOCA AUTOMÁTICAMENTE al Agente Frontend.

---

## PASO 4: Rol [Frontend]
1. Construye la interfaz en React + Tailwind v4 consumiendo los servicios aprobados por el Reviewer.
2. Invoca al Agente Tester cuando la interfaz esté implementada.

---

## PASO 5: Rol [Tester]
1. Ejecuta el test de sanidad básico con la interfaz disponible:
   `npx playwright test tests/tests/health-check.spec.ts`
2. Ejecuta la integración de Supabase:
   `npx playwright test tests/tests/supabase.spec.ts`
3. Verifica que el cliente de Supabase conecte correctamente y las tablas acepten UUIDs e integridad referencial.
4. Presenta el resultado final al usuario.
