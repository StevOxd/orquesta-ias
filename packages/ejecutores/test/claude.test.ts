import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { esquemaEvento } from "@orquesta/contratos";
import { argumentosClaude, crearTraductorClaude, resolverBinarioClaude } from "../src/claude.ts";
import { relojFijo, reproducir, solicitudDePrueba } from "./apoyo.ts";

const valorDe = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("argumentosClaude", () => {
  test("en lectura no da herramientas ni permiso de edición", () => {
    const args = argumentosClaude(solicitudDePrueba());
    assert.equal(valorDe(args, "--tools"), "");
    assert.equal(valorDe(args, "--permission-prompts"), "none");
    assert.ok(args.includes("--safe-mode"));
    assert.ok(!args.includes("--permission-mode"));
  });

  test("en escritura acepta ediciones y pasa las reglas preaprobadas y el esquema", () => {
    const args = argumentosClaude(
      solicitudDePrueba({ modo: "escritura", permitidas: ["Bash(npm test:*)"], esquema: { type: "object" } }),
    );
    assert.equal(valorDe(args, "--tools"), "Read,Grep,Glob,Edit,Write,Bash");
    assert.equal(valorDe(args, "--permission-mode"), "acceptEdits");
    assert.equal(valorDe(args, "--allowedTools"), "Bash(npm test:*)");
    assert.equal(valorDe(args, "--json-schema"), '{"type":"object"}');
  });
});

describe("resolverBinarioClaude", () => {
  test("respeta PECERA_CLAUDE_BIN", () => {
    assert.equal(resolverBinarioClaude({ PECERA_CLAUDE_BIN: "/opt/claude" }), "/opt/claude");
  });

  test("elige la versión más reciente de la extensión comparando números, no texto", () => {
    const inicio = mkdtempSync(join(tmpdir(), "pecera-"));
    for (const version of ["2.1.9", "2.1.312", "2.1.40"]) {
      const carpeta = join(inicio, ".vscode", "extensions", `anthropic.claude-code-${version}-darwin-arm64`, "resources", "native-binary");
      mkdirSync(carpeta, { recursive: true });
      writeFileSync(join(carpeta, "claude"), "");
    }
    assert.match(resolverBinarioClaude({}, inicio), /claude-code-2\.1\.312-/);
  });

  test("sin extensión cae al claude del PATH", () => {
    assert.equal(resolverBinarioClaude({}, mkdtempSync(join(tmpdir(), "pecera-"))), "claude");
  });
});

describe("crearTraductorClaude con grabaciones reales", () => {
  test("lectura con la herramienta Read", () => {
    const traductor = crearTraductorClaude(solicitudDePrueba({ modelo: "claude-haiku-5-5" }), relojFijo);
    const eventos = reproducir(traductor, "claude/lectura-con-herramienta.ndjson");

    assert.deepEqual(eventos.map((e) => e.tipo), ["agente_inicio", "herramienta", "cuota", "mensaje"]);
    assert.equal(eventos[1]?.detalle, "Read: probe/calc.py");
    assert.deepEqual(eventos[2]?.cuota?.map((v) => [v.ventana, v.uso]), [["five_hour", 0.01], ["seven_day", 0.1]]);
    for (const evento of eventos) assert.equal(esquemaEvento.safeParse(evento).success, true);

    const resultado = traductor.resultado();
    assert.equal(resultado.estado, "exito");
    assert.match(resultado.respuesta, /a - b/);
    assert.deepEqual(resultado.tokens, { entrada: 4 + 2640 + 5845, salida: 166 });
    assert.equal(resultado.conversacion, "727bbe9b-1bd3-47c2-8902-fcb85b7846ea");
  });

  test("salida estructurada con --json-schema", () => {
    const traductor = crearTraductorClaude(solicitudDePrueba(), relojFijo);
    const eventos = reproducir(traductor, "claude/esquema.ndjson");
    assert.ok(!eventos.some((e) => e.tipo === "herramienta"), "StructuredOutput no es una acción del agente");
    assert.deepEqual((traductor.resultado().estructurado as { nivel: string }).nivel, "mecanico");
  });

  test("sin línea result el resultado es un error", () => {
    const traductor = crearTraductorClaude(solicitudDePrueba(), relojFijo);
    traductor.procesar('{"type":"system","subtype":"init","session_id":"s1"}');
    traductor.procesar("esto no es JSON");
    assert.equal(traductor.resultado().estado, "error");
  });

  test("un límite alcanzado marca la suscripción fuera de turno", () => {
    const traductor = crearTraductorClaude(solicitudDePrueba(), relojFijo);
    const eventos = traductor.procesar(
      JSON.stringify({
        type: "rate_limit_event",
        rate_limit_info: { status: "rejected", unifiedWindows: { five_hour: { utilization: 1, resetsAt: 1793371200 } } },
      }),
    );
    assert.deepEqual(eventos.map((e) => e.tipo), ["cuota", "fuera_de_turno"]);
    traductor.procesar(JSON.stringify({ type: "result", is_error: true, result: "Claude AI usage limit reached" }));
    assert.equal(traductor.resultado().estado, "cuota_agotada");
  });
});
