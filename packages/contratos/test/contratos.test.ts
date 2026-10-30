import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  aJsonSchema,
  esquemaEstado,
  esquemaEvento,
  esquemaProyecto,
  esquemaQaReportValido,
  esquemaTareas,
  esquemaTareasValidas,
  revisarRequerimiento,
} from "../src/index.ts";

const mensajes = (resultado: { success: boolean; error?: { issues: { message: string }[] } }) =>
  resultado.error?.issues.map((issue) => issue.message) ?? [];

const tarea = (id: string, depende_de: string[] = []) => ({
  id,
  titulo: `Tarea ${id}`,
  rol: "dev-backend",
  tipo: "complejo",
  archivos: ["src/routes.ts"],
  criterios: ["CA-1"],
  depende_de,
});

describe("tareas.json", () => {
  test("acepta el ejemplo del diseño", () => {
    const plan = { trabajo: "T-0001", tareas: [tarea("TA-1"), tarea("TA-2", ["TA-1"])] };
    assert.equal(esquemaTareasValidas.safeParse(plan).success, true);
  });

  test("rechaza ids repetidos y dependencias inexistentes", () => {
    const plan = { trabajo: "T-0001", tareas: [tarea("TA-1"), tarea("TA-1", ["TA-9"])] };
    const errores = mensajes(esquemaTareasValidas.safeParse(plan));
    assert.ok(errores.some((m) => m.includes("TA-1 está repetida")));
    assert.ok(errores.some((m) => m.includes("TA-9, que no existe")));
  });

  test("rechaza dependencias en ciclo", () => {
    const plan = { trabajo: "T-0001", tareas: [tarea("TA-1", ["TA-3"]), tarea("TA-2", ["TA-1"]), tarea("TA-3", ["TA-2"])] };
    const errores = mensajes(esquemaTareasValidas.safeParse(plan));
    assert.ok(errores.some((m) => m.startsWith("Las dependencias forman un ciclo")), errores.join("\n"));
  });

  test("rechaza campos que no están en el contrato", () => {
    const plan = { trabajo: "T-0001", tareas: [{ ...tarea("TA-1"), prioridad: "alta" }] };
    assert.equal(esquemaTareas.safeParse(plan).success, false);
  });
});

describe("qa-report.json", () => {
  const evidencia = { comando: "npm test -- auth", salida: "12 passed", codigo_salida: 0 };

  test("acepta el ejemplo del diseño", () => {
    const reporte = {
      trabajo: "T-0001",
      veredicto: "falla",
      criterios: [
        { id: "CA-1", estado: "cumple", evidencia },
        { id: "CA-2", estado: "no_cumple", evidencia, hallazgo: "No valida un token vacío" },
      ],
      revisor: { rol: "qa", modelo: "gemini-3.8-flash-medium" },
    };
    assert.equal(esquemaQaReportValido.safeParse(reporte).success, true);
  });

  test("rechaza un veredicto que no coincide con los criterios", () => {
    const reporte = {
      trabajo: "T-0001",
      veredicto: "pasa",
      criterios: [{ id: "CA-1", estado: "no_cumple", evidencia }],
      revisor: { rol: "qa", modelo: "gemini-3.8-flash-medium" },
    };
    const errores = mensajes(esquemaQaReportValido.safeParse(reporte));
    assert.ok(errores.some((m) => m.includes("no explica el hallazgo")));
    assert.ok(errores.some((m) => m.includes("hay criterios que no se cumplen")));
  });
});

describe("estado.json, eventos y proyecto.yaml", () => {
  test("acepta el estado del diseño", () => {
    const estado = {
      trabajo: "T-0001",
      carril: "completo",
      fase: "qa",
      ciclos_qa: 1,
      historial: [
        {
          fase: "analisis",
          rol: "pmo-analista",
          modelo: "gemini-4-argon-high",
          suscripcion: "antigravity",
          inicio: "2026-10-30T14:00:00Z",
          fin: "2026-10-30T14:01:10Z",
          tokens: { entrada: 31200, salida: 1850 },
        },
      ],
    };
    assert.equal(esquemaEstado.safeParse(estado).success, true);
  });

  test("acepta eventos de ejecutor y del motor, y rechaza tipos desconocidos", () => {
    const evento = {
      ts: "2026-10-30T14:03:22.120Z",
      trabajo: "T-0001",
      fase: "qa",
      agente: "qa-api#1",
      rol: "qa-api",
      modelo: "gemini-3.8-flash-medium",
      suscripcion: "antigravity",
      tipo: "herramienta",
      detalle: "npm test -- auth",
    };
    assert.equal(esquemaEvento.safeParse(evento).success, true);
    assert.equal(esquemaEvento.safeParse({ ts: evento.ts, trabajo: "T-0001", fase: "analisis", tipo: "esperando_aprobacion" }).success, true);
    assert.equal(esquemaEvento.safeParse({ ...evento, tipo: "durmiendo" }).success, false);
  });

  test("acepta el proyecto.yaml de cooperativa-app", () => {
    const proyecto = {
      nombre: "cooperativa-app",
      tipos: ["servicio", "frontend"],
      aislamiento: "rama",
      excluir: [".env", ".agent/reportes/", "backend/uploads/"],
      reglas: [".agent/rules/PROJECT_RULES.md"],
      equipo: ["pmo-analista", "dev-backend", "qa-api"],
      comandos_qa: [],
    };
    assert.equal(esquemaProyecto.safeParse(proyecto).success, true);
    assert.equal(esquemaProyecto.safeParse({ ...proyecto, aislamiento: "contenedor" }).success, false);
  });
});

describe("requerimiento.md", () => {
  const completo = `# Requerimiento T-0001

## Objetivo
Subir PDF de crédito de hasta 5 MB.

## Alcance
- Incluye: nginx y el mensaje del frontend.

## Criterios de aceptación
- CA-1: un PDF de 1 MB se sube. Verificación: curl con un PDF de 1 MB responde 200.
- **CA-2**: un PDF de 9 MB se rechaza con un mensaje claro. Verificación: curl responde 413.

## Riesgos
- Aumentar el límite en más rutas de las necesarias.

## Preguntas abiertas
- Ninguna.
`;

  test("un requerimiento completo puede avanzar", () => {
    const revision = revisarRequerimiento(completo);
    assert.deepEqual(revision.criterios, ["CA-1", "CA-2"]);
    assert.equal(revision.puedeAvanzar, true);
  });

  test("una pregunta abierta bloquea la compuerta", () => {
    const revision = revisarRequerimiento(completo.replace("- Ninguna.", "- ¿Aplica también a la ventanilla?"));
    assert.deepEqual(revision.preguntasAbiertas, ["¿Aplica también a la ventanilla?"]);
    assert.equal(revision.puedeAvanzar, false);
  });

  test("detecta secciones faltantes y criterios sin verificación", () => {
    const revision = revisarRequerimiento(
      completo.replace("## Riesgos", "## Otros").replace(". Verificación: curl responde 413.", "."),
    );
    assert.deepEqual(revision.seccionesFaltantes, ["Riesgos"]);
    assert.deepEqual(revision.criteriosSinVerificacion, ["CA-2"]);
    assert.equal(revision.puedeAvanzar, false);
  });
});

describe("aJsonSchema", () => {
  test("exporta tareas.json sin $schema y con campos obligatorios", () => {
    const esquema = aJsonSchema(esquemaTareas);
    assert.equal(esquema.$schema, undefined);
    assert.equal(esquema.type, "object");
    assert.deepEqual(esquema.required, ["trabajo", "tareas"]);
    assert.equal(esquema.additionalProperties, false);
  });
});
