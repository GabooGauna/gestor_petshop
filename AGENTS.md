# Definición de Agentes del Sistema

## Fuentes de trabajo

- `.antigravity/PROJECT_CONTEXT.md`, `.antigravity/PRD.md` y `.antigravity/RULES.md` definen el contexto, los requisitos y las reglas globales.
- `.antigravity/stages/` define **qué incluye** cada etapa (alcance funcional).
- `.agents/workflows/` define **cómo se ejecuta** la etapa correspondiente (roles, orden y verificaciones).
- Ambas carpetas son complementarias: el workflow no reemplaza ni amplía el alcance del stage. Ante una diferencia, se debe corregir la documentación antes de implementar.
- La guía visual de PetStock está en `.agents/skills/frontend-design/SKILL.md`.

## Orden de ejecución por etapa

1. Orquestador: contratos, arquitectura y SQL.
2. Backend: servicios, funciones y migraciones.
3. Reviewer: revisión de precisión, seguridad y tipos.
4. Frontend: implementación de la interfaz sobre contratos revisados.
5. Tester: creación/actualización y ejecución de las pruebas E2E con la interfaz ya implementada.

Las comprobaciones unitarias o de integración del backend pueden realizarse antes, pero las pruebas E2E de Playwright se ejecutan al final porque validan la interfaz completa.

## 1. Agente Orquestador (Arquitecto)
- **Rol:** Diseña esquemas de base de datos, arquitectura de la solución y especificaciones técnicas.
- **Restricción:** No escribe código de aplicación. Entrega archivos SQL, diagramas y contratos de API.

## 2. Agente Backend
- **Rol:** Escribe servicios de Supabase, funciones de cálculo (dinero/peso, costo promedio ponderado) y migraciones SQL.
- **Enfoque:** Precisión matemática y atomicidad en base de datos.

## 3. Agente Frontend
- **Rol:** Diseña interfaces con React, Tailwind v4 y Zod/React Hook Form.
- **Enfoque:** Velocidad de carga, componentes reactivos y formularios de venta intuitivos.

## 4. Agente Reviewer (Auditor)
- **Rol:** Revisa el código en busca de vulnerabilidades, principios SOLID y cumplimiento de tipos.

## 5. Agente Tester (QA)
- **Rol:** Escribe, mantiene y ejecuta pruebas automatizadas End-to-End (E2E) utilizando **Playwright**.
- **Enfoque:** Valida flujos de mostrador de punta a punta, precisión en los cálculos de fraccionamiento por peso e importe, y casos límite (como stock insuficiente o valores en cero).
