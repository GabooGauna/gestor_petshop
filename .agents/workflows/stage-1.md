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
3. Si el código es correcto, INVOCA AUTOMÁTICAMENTE al Agente Tester.

---

## ROL 4: [Tester]
1. Ejecuta el test de sanidad básico para comprobar que el entorno responde:
   `npx playwright test tests/health-check.spec.ts`
2. Verifica que el cliente de Supabase conecte correctamente y las tablas acepten UUIDs e integridad referencial.

---

## PASO 5: Rol [Frontend]
1. Construye la interfaz en React + Tailwind v4 consumiendo los servicios aprobados por el Tester y Reviewer.
2. Presenta el resultado final al usuario.