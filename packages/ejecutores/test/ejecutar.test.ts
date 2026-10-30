import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Evento } from "@orquesta/contratos";
import { crearTraductorAgy } from "../src/agy.ts";
import { crearTraductorClaude } from "../src/claude.ts";
import { ejecutarConTraductor } from "../src/ejecutar.ts";
import { rutaGrabacion, solicitudDePrueba } from "./apoyo.ts";

const cliFalso = fileURLToPath(new URL("./cli-falso.mjs", import.meta.url));

describe("ejecutarConTraductor con un proceso real", () => {
  test("traduce la salida y cierra con agente_fin", async () => {
    const solicitud = solicitudDePrueba({ directorio: process.cwd() });
    const eventos: Evento[] = [];
    const resultado = await ejecutarConTraductor(
      solicitud,
      {
        comando: process.execPath,
        args: [cliFalso, rutaGrabacion("claude/lectura-con-herramienta.ndjson")],
        entrada: solicitud.prompt,
        suscripcion: "claude",
        traductor: crearTraductorClaude(solicitud),
      },
      (evento) => eventos.push(evento),
    );
    assert.equal(resultado.estado, "exito");
    assert.deepEqual(eventos.map((e) => e.tipo), ["agente_inicio", "herramienta", "cuota", "mensaje", "agente_fin"]);
    assert.deepEqual(eventos.at(-1)?.tokens, resultado.tokens);
  });

  test("una respuesta vacía emite un error antes de agente_fin", async () => {
    const solicitud = solicitudDePrueba({ directorio: process.cwd() });
    const eventos: Evento[] = [];
    await ejecutarConTraductor(
      solicitud,
      {
        comando: process.execPath,
        args: [cliFalso, rutaGrabacion("agy/comando-denegado.ndjson")],
        entrada: "",
        suscripcion: "antigravity",
        traductor: crearTraductorAgy(solicitud),
      },
      (evento) => eventos.push(evento),
    );
    assert.deepEqual(eventos.slice(-2).map((e) => [e.tipo, e.detalle]), [["error", "Respuesta vacía"], ["agente_fin", "vacio"]]);
  });

  test("mata el proceso cuando pasa el tiempo límite", async () => {
    const solicitud = solicitudDePrueba({ directorio: process.cwd(), tiempoLimiteMs: 300 });
    const resultado = await ejecutarConTraductor(solicitud, {
      comando: process.execPath,
      args: [cliFalso, rutaGrabacion("agy/esquema.ndjson"), "10000"],
      entrada: "",
      suscripcion: "antigravity",
      traductor: crearTraductorAgy(solicitud),
    });
    assert.equal(resultado.estado, "tiempo_agotado");
  });

  test("un binario inexistente se reporta como error sin lanzar excepción", async () => {
    const solicitud = solicitudDePrueba({ directorio: process.cwd() });
    const resultado = await ejecutarConTraductor(solicitud, {
      comando: "/no/existe/pecera-cli",
      args: [],
      entrada: "",
      suscripcion: "claude",
      traductor: crearTraductorClaude(solicitud),
    });
    assert.equal(resultado.estado, "error");
    assert.match(resultado.error ?? "", /No se pudo ejecutar \/no\/existe\/pecera-cli/);
  });
});
