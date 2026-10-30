// Prueba de humo contra los CLI reales: gasta un poco de cuota de cada suscripción.
// Pide un tareas.json con el esquema del contrato y lo valida con las reglas completas.
//
// Uso: npm run humo [-- --solo claude|antigravity]

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aJsonSchema, esquemaTareas, esquemaTareasValidas, type Suscripcion } from "@orquesta/contratos";
import { ejecutores, type SolicitudEjecucion } from "@orquesta/ejecutores";

const modelos: Record<Suscripcion, string> = {
  claude: "claude-haiku-5-5",
  antigravity: "gemini-3.8-flash-low",
};

const prompt = `Eres el arquitecto. Divide este requerimiento en tareas para tareas.json del trabajo T-0001.

Requerimiento: nginx responde 413 cuando el PDF firmado de un crédito pesa más de 1 MB, porque
location /api/ no define client_max_body_size. Hay que dar 8 MB solo a la ruta
POST /api/asociado/creditos/:id/subir-expediente-firmado (archivo frontend/nginx.conf) y mostrar
un mensaje claro en el frontend cuando la respuesta sea 413 (archivo frontend/src/api.js).

Criterios: CA-1 (un PDF de 7 MB se sube) y CA-2 (uno de 9 MB muestra el mensaje).
Usa los roles dev-backend o dev-frontend. Responde solo con el JSON.`;

const indiceSolo = process.argv.indexOf("--solo");
const suscripciones = (indiceSolo >= 0 ? [process.argv[indiceSolo + 1]] : Object.keys(modelos)) as Suscripcion[];
const directorio = mkdtempSync(join(tmpdir(), "pecera-humo-"));
let fallas = 0;

for (const suscripcion of suscripciones) {
  const solicitud: SolicitudEjecucion = {
    contexto: { trabajo: "T-0001", fase: "diseno", rol: "arquitecto", agente: `arquitecto#${suscripcion}` },
    modelo: modelos[suscripcion],
    prompt,
    directorio,
    modo: "lectura",
    esquema: aJsonSchema(esquemaTareas),
    tiempoLimiteMs: 120_000,
  };

  console.log(`\n=== ${suscripcion} (${solicitud.modelo}) ===`);
  const resultado = await ejecutores[suscripcion].ejecutar(solicitud, (evento) => {
    const extra = evento.tokens ? ` [${evento.tokens.entrada} → ${evento.tokens.salida} tokens]` : "";
    const cuota = evento.cuota?.map((v) => `${v.ventana} ${Math.round(v.uso * 100)}%`).join(", ") ?? "";
    console.log(`  ${evento.tipo.padEnd(14)} ${evento.detalle ?? cuota}${extra}`);
  });

  const validacion = esquemaTareasValidas.safeParse(resultado.estructurado);
  console.log(`  → estado: ${resultado.estado}, ${resultado.duracionMs} ms`);
  if (validacion.success) {
    for (const tarea of validacion.data.tareas) console.log(`    ${tarea.id} [${tarea.tipo}] ${tarea.titulo}`);
  } else {
    fallas++;
    console.log(`  ✗ tareas.json no cumple el contrato: ${resultado.error ?? validacion.error.issues.map((i) => i.message).join("; ")}`);
  }
}

process.exitCode = fallas ? 1 : 0;
