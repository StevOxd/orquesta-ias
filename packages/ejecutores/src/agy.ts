import type { Evento } from "@orquesta/contratos";
import { ejecutarConTraductor } from "./ejecutar.ts";
import { analizarLinea, fabricaDeEventos, relojDelSistema, resumir, resumirHerramienta, type Reloj } from "./eventos.ts";
import type { Ejecutor, EstadoResultado, ModoEjecucion, SolicitudEjecucion, Traductor } from "./tipos.ts";

export function resolverBinarioAgy(entorno: NodeJS.ProcessEnv = process.env): string {
  return entorno.PECERA_AGY_BIN ?? "agy";
}

/**
 * En `plan` agy no ejecuta comandos. `auto` sí, pero sin nadie que apruebe deniega lo que
 * necesitaría permiso (docs/diseno.md, 3.4); esas denegaciones llegan en el resultado.
 */
const modoAgy: Record<ModoEjecucion, string> = {
  lectura: "plan",
  "lectura-y-comandos": "auto",
  escritura: "auto",
};

const segundos = (ms: number) => `${Math.ceil(ms / 1000)}s`;

export function argumentosAgy(solicitud: SolicitudEjecucion): string[] {
  const args = [
    // Con stream-json el prompt llega por stdin, así que -p va vacío y pegado al flag.
    "-p=",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--model", solicitud.modelo,
    "--mode", modoAgy[solicitud.modo],
    "--print-timeout", segundos(solicitud.tiempoLimiteMs ?? 10 * 60 * 1000),
  ];
  if (solicitud.esquema) args.push("--json-schema", JSON.stringify(solicitud.esquema));
  return args;
}

/** Mensaje de entrada en el formato que acepta `agy --input-format stream-json`. */
export function entradaAgy(prompt: string): string {
  return `${JSON.stringify({ event: "user", message: { role: "user", content: prompt } })}\n`;
}

interface PasoAgy {
  step_index?: number;
  step_type?: string;
  state?: string;
  tool_name?: string;
  text_delta?: string;
  tool_info?: { name?: string; parameters?: unknown; error?: { message?: string } };
}

interface ResultadoAgy {
  status?: string;
  response?: string;
  structured_output?: unknown;
  error?: string;
  duration_seconds?: number;
  conversation_id?: string;
  usage?: { input_tokens?: number; output_tokens?: number; thinking_tokens?: number };
  denied_actions?: { action?: string; display_name?: string }[];
}

interface LineaAgy {
  event?: string;
  conversation_id?: string;
  init?: { model?: string; permission_mode?: string };
  step_update?: PasoAgy;
  result?: ResultadoAgy;
}

// No hay una lista oficial de errores de cuota de agy; se reconocen por el texto.
const pareceCuota = /quota|rate.?limit|resource.?exhausted|\b429\b/i;

export function crearTraductorAgy(solicitud: SolicitudEjecucion, reloj: Reloj = relojDelSistema): Traductor {
  const evento = fabricaDeEventos(solicitud.contexto, solicitud.modelo, "antigravity", reloj);
  const textos = new Map<number, string>();
  const denegaciones: string[] = [];
  let final: ResultadoAgy | undefined;
  let conversacion: string | undefined;

  const traducirPaso = (paso: PasoAgy): Evento[] => {
    if (paso.step_type === "tool") {
      const nombre = paso.tool_name ?? paso.tool_info?.name ?? "herramienta";
      const descripcion = resumirHerramienta(nombre, paso.tool_info?.parameters);
      if (paso.state === "ACTIVE") return [evento("herramienta", { detalle: descripcion })];
      if (paso.state === "ERROR") {
        const mensaje = (paso.tool_info?.error?.message ?? "").split("\n")[0] ?? "";
        if (/permission|denied/i.test(mensaje)) denegaciones.push(descripcion);
        return [evento("error", { detalle: resumir(`${descripcion} → ${mensaje}`) })];
      }
      return [];
    }
    if (paso.step_type === "agent_response") {
      // La respuesta puede llegar en trozos; se muestra completa cuando el paso termina.
      const indice = paso.step_index ?? -1;
      const texto = (textos.get(indice) ?? "") + (paso.text_delta ?? "");
      textos.set(indice, texto);
      if (paso.state === "DONE" && texto.trim()) return [evento("mensaje", { detalle: resumir(texto) })];
    }
    return [];
  };

  return {
    procesar(linea) {
      const datos = analizarLinea<LineaAgy>(linea);
      if (!datos) return [];
      if (datos.event === "init") {
        conversacion = datos.conversation_id;
        return [evento("agente_inicio", { detalle: `agy (${datos.init?.permission_mode ?? "sin modo"})` })];
      }
      if (datos.event === "step_update" && datos.step_update) return traducirPaso(datos.step_update);
      if (datos.event === "result" && datos.result) {
        final = datos.result;
        conversacion ??= datos.result.conversation_id;
      }
      return [];
    },

    resultado() {
      if (!final) {
        return { estado: "error", respuesta: "", tokens: { entrada: 0, salida: 0 }, duracionMs: 0, conversacion, denegaciones };
      }
      const respuesta = final.response ?? "";
      let estado: EstadoResultado;
      if (final.status === "SUCCESS") {
        estado = respuesta.trim() || final.structured_output !== undefined ? "exito" : "vacio";
      } else {
        estado = pareceCuota.test(final.error ?? "") ? "cuota_agotada" : "error";
      }
      const negadas = (final.denied_actions ?? []).map((d) => d.display_name ?? d.action ?? "desconocida");
      return {
        estado,
        respuesta,
        estructurado: final.structured_output,
        tokens: {
          entrada: final.usage?.input_tokens ?? 0,
          salida: (final.usage?.output_tokens ?? 0) + (final.usage?.thinking_tokens ?? 0),
        },
        duracionMs: Math.round((final.duration_seconds ?? 0) * 1000),
        conversacion,
        error: final.status === "SUCCESS" ? undefined : final.error ?? `agy terminó con estado ${final.status}`,
        denegaciones: [...denegaciones, ...negadas.filter((n) => !denegaciones.some((d) => d.startsWith(n)))],
      };
    },
  };
}

export const ejecutorAgy: Ejecutor = {
  suscripcion: "antigravity",
  ejecutar(solicitud, alEvento) {
    return ejecutarConTraductor(
      solicitud,
      {
        comando: resolverBinarioAgy(),
        args: argumentosAgy(solicitud),
        entrada: entradaAgy(solicitud.prompt),
        suscripcion: "antigravity",
        traductor: crearTraductorAgy(solicitud),
        // agy corta solo con --print-timeout; el margen le deja emitir su propio resultado.
        margenMs: 15_000,
      },
      alEvento,
    );
  },
};
