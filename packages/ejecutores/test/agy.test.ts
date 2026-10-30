import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { esquemaEvento } from "@orquesta/contratos";
import { argumentosAgy, crearTraductorAgy, entradaAgy } from "../src/agy.ts";
import { relojFijo, reproducir, solicitudDePrueba } from "./apoyo.ts";

const valorDe = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("argumentosAgy y entradaAgy", () => {
  test("el prompt va por stdin y la lectura usa el modo plan", () => {
    const args = argumentosAgy(solicitudDePrueba({ tiempoLimiteMs: 90_500 }));
    assert.equal(args[0], "-p=");
    assert.equal(valorDe(args, "--input-format"), "stream-json");
    assert.equal(valorDe(args, "--mode"), "plan");
    assert.equal(valorDe(args, "--print-timeout"), "91s");
    assert.ok(!args.includes("--json-schema"));
  });

  test("escritura usa auto y el esquema viaja como JSON", () => {
    const args = argumentosAgy(solicitudDePrueba({ modo: "escritura", esquema: { type: "object" } }));
    assert.equal(valorDe(args, "--mode"), "auto");
    assert.equal(valorDe(args, "--json-schema"), '{"type":"object"}');
  });

  test("entradaAgy produce una línea con el evento user", () => {
    const linea = entradaAgy("Hola\ncon salto");
    assert.ok(linea.endsWith("\n"));
    assert.deepEqual(JSON.parse(linea), { event: "user", message: { role: "user", content: "Hola\ncon salto" } });
  });
});

describe("crearTraductorAgy con grabaciones reales", () => {
  test("salida estructurada con --json-schema", () => {
    const traductor = crearTraductorAgy(solicitudDePrueba({ modelo: "gemini-3.8-flash-low" }), relojFijo);
    const eventos = reproducir(traductor, "agy/esquema.ndjson");

    assert.deepEqual(eventos.map((e) => e.tipo), ["agente_inicio", "mensaje"]);
    assert.equal(eventos[0]?.detalle, "agy (request-review)");
    for (const evento of eventos) assert.equal(esquemaEvento.safeParse(evento).success, true);

    const resultado = traductor.resultado();
    assert.equal(resultado.estado, "exito");
    assert.equal((resultado.estructurado as { nivel: string }).nivel, "mecanico");
    assert.equal(resultado.duracionMs, 4185);
  });

  test("un comando denegado deja la respuesta vacía y lo reporta", () => {
    const traductor = crearTraductorAgy(solicitudDePrueba(), relojFijo);
    const eventos = reproducir(traductor, "agy/comando-denegado.ndjson");

    assert.deepEqual(eventos.map((e) => e.tipo), ["agente_inicio", "herramienta", "error"]);
    assert.match(eventos[2]?.detalle ?? "", /^run_command: pwd && ls -la → permission check failed/);

    const resultado = traductor.resultado();
    assert.equal(resultado.estado, "vacio");
    assert.deepEqual(resultado.denegaciones, ["run_command: pwd && ls -la", "RunCommand"]);
    assert.deepEqual(resultado.tokens, { entrada: 9928, salida: 39 });
  });

  test("la respuesta en trozos se muestra una sola vez, completa", () => {
    const traductor = crearTraductorAgy(solicitudDePrueba(), relojFijo);
    const paso = (state: string, text_delta: string) =>
      JSON.stringify({ event: "step_update", step_update: { step_index: 1, step_type: "agent_response", state, text_delta } });
    assert.deepEqual(traductor.procesar(paso("ACTIVE", "Hola ")), []);
    assert.deepEqual(traductor.procesar(paso("DONE", "mundo")).map((e) => e.detalle), ["Hola mundo"]);
  });

  test("un error de cuota pone el resultado en cuota_agotada", () => {
    const traductor = crearTraductorAgy(solicitudDePrueba(), relojFijo);
    traductor.procesar(JSON.stringify({ event: "result", result: { status: "ERROR", error: "RESOURCE_EXHAUSTED: quota exceeded" } }));
    assert.equal(traductor.resultado().estado, "cuota_agotada");
  });
});
