import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Evento } from "@orquesta/contratos";
import { ejecutarConTraductor } from "./ejecutar.ts";
import { analizarLinea, fabricaDeEventos, relojDelSistema, resumir, resumirHerramienta, type Reloj } from "./eventos.ts";
import type { Ejecutor, EstadoResultado, ModoEjecucion, SolicitudEjecucion, Traductor } from "./tipos.ts";

/**
 * Binario de Claude Code. Por ahora se usa el que trae la extensión de VS Code (docs/diseno.md, 3.1);
 * su ruta cambia con cada actualización, así que se busca la versión más reciente.
 */
export function resolverBinarioClaude(entorno: NodeJS.ProcessEnv = process.env, inicio: string = homedir()): string {
  if (entorno.PECERA_CLAUDE_BIN) return entorno.PECERA_CLAUDE_BIN;
  const extensiones = join(inicio, ".vscode", "extensions");
  if (existsSync(extensiones)) {
    const version = (nombre: string) => (/^anthropic\.claude-code-(\d+)\.(\d+)\.(\d+)/.exec(nombre) ?? []).slice(1).map(Number);
    const candidatas = readdirSync(extensiones)
      .filter((nombre) => version(nombre).length === 3)
      .sort((a, b) => {
        const [va, vb] = [version(a), version(b)];
        return (vb[0]! - va[0]!) || (vb[1]! - va[1]!) || (vb[2]! - va[2]!);
      })
      .map((nombre) => join(extensiones, nombre, "resources", "native-binary", "claude"));
    const binario = candidatas.find((ruta) => existsSync(ruta));
    if (binario) return binario;
  }
  return "claude";
}

const herramientasPorModo: Record<ModoEjecucion, string[]> = {
  lectura: [],
  "lectura-y-comandos": ["Read", "Grep", "Glob", "Bash"],
  escritura: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
};

export function argumentosClaude(solicitud: SolicitudEjecucion): string[] {
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--model", solicitud.modelo,
    "--tools", (solicitud.herramientas ?? herramientasPorModo[solicitud.modo]).join(","),
    // Lo que pediría permiso se deniega solo: no hay nadie para aprobarlo.
    "--permission-prompts", "none",
    "--no-session-persistence",
    // Sin CLAUDE.md, hooks ni MCP del usuario: las reglas del proyecto van en el prompt.
    "--safe-mode",
  ];
  if (solicitud.modo === "escritura") args.push("--permission-mode", "acceptEdits");
  if (solicitud.permitidas?.length) args.push("--allowedTools", ...solicitud.permitidas);
  if (solicitud.esquema) args.push("--json-schema", JSON.stringify(solicitud.esquema));
  return args;
}

interface BloqueClaude {
  type?: string;
  name?: string;
  input?: unknown;
  text?: string;
}

interface VentanaClaude {
  utilization?: number;
  resetsAt?: number;
  status?: string;
}

interface LineaClaude {
  type?: string;
  subtype?: string;
  session_id?: string;
  claude_code_version?: string;
  message?: { content?: BloqueClaude[] };
  rate_limit_info?: { status?: string; unifiedWindows?: Record<string, VentanaClaude> };
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  duration_ms?: number;
  usage?: {
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    output_tokens?: number;
  };
  permission_denials?: { tool_name?: string }[];
}

export function crearTraductorClaude(solicitud: SolicitudEjecucion, reloj: Reloj = relojDelSistema): Traductor {
  const evento = fabricaDeEventos(solicitud.contexto, solicitud.modelo, "claude", reloj);
  let final: LineaClaude | undefined;
  let conversacion: string | undefined;
  let fueraDeTurno = false;

  const traducirCuota = (info: NonNullable<LineaClaude["rate_limit_info"]>): Evento[] => {
    const cuota = Object.entries(info.unifiedWindows ?? {})
      .filter(([, v]) => typeof v.utilization === "number" && typeof v.resetsAt === "number")
      .map(([ventana, v]) => ({ ventana, uso: Math.min(1, v.utilization!), reinicia: new Date(v.resetsAt! * 1000).toISOString() }));
    const eventos = cuota.length ? [evento("cuota", { cuota })] : [];
    if (info.status && info.status !== "allowed") {
      fueraDeTurno = true;
      eventos.push(evento("fuera_de_turno", { detalle: `Límite de Claude: ${info.status}` }));
    }
    return eventos;
  };

  return {
    procesar(linea) {
      const datos = analizarLinea<LineaClaude>(linea);
      if (!datos) return [];
      switch (datos.type) {
        case "system":
          if (datos.subtype !== "init") return [];
          conversacion = datos.session_id;
          return [evento("agente_inicio", { detalle: `Claude Code ${datos.claude_code_version ?? ""}`.trim() })];
        case "assistant":
          return (datos.message?.content ?? []).flatMap((bloque): Evento[] => {
            // StructuredOutput es como claude entrega --json-schema, no una acción del agente.
            if (bloque.type === "tool_use" && bloque.name && bloque.name !== "StructuredOutput") {
              return [evento("herramienta", { detalle: resumirHerramienta(bloque.name, bloque.input) })];
            }
            if (bloque.type === "text" && bloque.text?.trim()) return [evento("mensaje", { detalle: resumir(bloque.text) })];
            return [];
          });
        case "rate_limit_event":
          return datos.rate_limit_info ? traducirCuota(datos.rate_limit_info) : [];
        case "result":
          final = datos;
          conversacion ??= datos.session_id;
          return [];
        default:
          return [];
      }
    },

    resultado() {
      if (!final) {
        return { estado: "error", respuesta: "", tokens: { entrada: 0, salida: 0 }, duracionMs: 0, conversacion, denegaciones: [] };
      }
      const respuesta = final.result ?? "";
      const uso = final.usage ?? {};
      let estado: EstadoResultado;
      if (final.is_error) {
        estado = fueraDeTurno || /rate.?limit|usage limit/i.test(respuesta) ? "cuota_agotada" : "error";
      } else {
        estado = respuesta.trim() || final.structured_output !== undefined ? "exito" : "vacio";
      }
      return {
        estado,
        respuesta,
        estructurado: final.structured_output,
        tokens: {
          entrada: (uso.input_tokens ?? 0) + (uso.cache_creation_input_tokens ?? 0) + (uso.cache_read_input_tokens ?? 0),
          salida: uso.output_tokens ?? 0,
        },
        duracionMs: final.duration_ms ?? 0,
        conversacion,
        error: final.is_error ? respuesta || "Claude terminó con error" : undefined,
        denegaciones: (final.permission_denials ?? []).map((d) => d.tool_name ?? "desconocida"),
      };
    },
  };
}

export const ejecutorClaude: Ejecutor = {
  suscripcion: "claude",
  ejecutar(solicitud, alEvento) {
    return ejecutarConTraductor(
      solicitud,
      {
        comando: resolverBinarioClaude(),
        args: argumentosClaude(solicitud),
        entrada: solicitud.prompt,
        suscripcion: "claude",
        traductor: crearTraductorClaude(solicitud),
      },
      alEvento,
    );
  },
};
