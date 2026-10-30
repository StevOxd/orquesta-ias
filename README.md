# Orquesta IAs

Una empresa de agentes de IA. Cada proyecto pasa por PMO, Arquitectura, Desarrollo y QA, como en una empresa real, y el trabajo se reparte entre tus suscripciones de Claude y Gemini.

![Pinzas, Chispa y Nudo sobre fondo claro y oscuro](docs/personajes/hoja.png)

## La idea

Si pagas más de una suscripción de IA, cada una tiene su cuota y sus fortalezas. Orquesta las trata como empleados de una misma empresa:

- **El proceso es código; los empleados son IA.** Una máquina de estados decide qué fase sigue y ningún modelo puede saltarse una compuerta.
- **Las áreas se comunican con documentos.** Cada fase entrega un artefacto con contrato (`requerimiento.md`, `tareas.json`, `qa-report.json`) y la siguiente solo recibe ese artefacto.
- **QA aprueba con evidencia.** Un criterio se cumple solo si un comando lo demuestra, y revisa una familia de modelo distinta a la que programó.
- **El equipo se arma según el proyecto.** Un servicio y una infraestructura no tienen los mismos roles, y si hace falta uno nuevo, se contrata con tu aprobación.
- **Tú eres la Gerencia.** Apruebas el requerimiento y la entrega.

Para ver el trabajo en vivo está **La Pecera**: una oficina en pixel art donde cada agente es un personaje. Pinzas es Claude, Chispa es Gemini y Nudo es GPT-OSS. Se abre con el CLI `pecera`.

## Estado

| Fase | Alcance | Estado |
|---|---|---|
| 0. Prueba de concepto | Contratos, ejecutores de `claude` y `agy`, y un flujo piloto sobre un proyecto real | En curso: contratos y ejecutores listos |
| 1. Empresa | Catálogo de roles, equipo por tipo de proyecto, RRHH | Pendiente |
| 2. La Pecera | Oficina visual con eventos en vivo y aprobaciones | Pendiente |
| 3. Optimización | Router que conoce la cuota de cada suscripción | Pendiente |

## Requisitos

- Node 24 o superior. Ejecuta el TypeScript directamente, sin compilar.
- Claude Code con sesión iniciada (la extensión de VS Code alcanza: su binario se encuentra solo).
- El CLI de Antigravity (`agy`) con sesión iniciada.

## Desarrollo

```sh
npm install
npm test          # pruebas, usando grabaciones reales de los CLI
npm run tipos     # revisión de tipos
npm run humo      # prueba contra los CLI reales; gasta un poco de cuota de cada suscripción
npm run sprites   # regenera docs/personajes/hoja.png
```

Para usar otros binarios: `PECERA_CLAUDE_BIN` y `PECERA_AGY_BIN`.

## Estructura

```
docs/                 diseño y personajes
packages/contratos/   esquemas de los artefactos y eventos
packages/ejecutores/  adaptadores de claude -p y agy -p
scripts/              utilidades (sprites, prueba de humo)
```

El diseño completo está en [docs/diseno.md](docs/diseno.md).

## Aviso

Orquesta IAs es un proyecto personal sin afiliación con Anthropic, Google ni OpenAI. Claude, Gemini, Antigravity y GPT-OSS son marcas de sus respectivos dueños.

## Licencia

[MIT](LICENSE)
