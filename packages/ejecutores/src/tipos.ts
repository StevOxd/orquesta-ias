import type { Evento, Fase, Suscripcion, Tokens } from "@orquesta/contratos";

/** Qué puede hacer el agente (docs/diseno.md, sección 10). */
export type ModoEjecucion = "lectura" | "lectura-y-comandos" | "escritura";

export interface ContextoEjecucion {
  trabajo: string;
  fase: Fase;
  rol: string;
  /** Identifica al personaje en la oficina, por ejemplo "qa-api#1". */
  agente: string;
}

export interface SolicitudEjecucion {
  contexto: ContextoEjecucion;
  /** Identificador del modelo tal como lo acepta el CLI ("sonnet", "gemini-3.8-flash-low"…). */
  modelo: string;
  /** Prompt completo, con el contenido de los archivos ya incluido. */
  prompt: string;
  directorio: string;
  modo: ModoEjecucion;
  /** Solo claude: herramientas disponibles (--tools). Por defecto dependen del modo. */
  herramientas?: string[];
  /** Solo claude: reglas preaprobadas (--allowedTools), por ejemplo "Bash(npm test:*)". */
  permitidas?: string[];
  /** JSON Schema de la salida; la respuesta llega en `estructurado`. */
  esquema?: Record<string, unknown>;
  tiempoLimiteMs?: number;
}

export type EstadoResultado = "exito" | "vacio" | "error" | "tiempo_agotado" | "cuota_agotada";

export interface ResultadoEjecucion {
  estado: EstadoResultado;
  respuesta: string;
  estructurado?: unknown;
  tokens: Tokens;
  duracionMs: number;
  conversacion?: string;
  error?: string;
  /** Acciones que el CLI bloqueó por permisos. */
  denegaciones: string[];
}

export type AlEvento = (evento: Evento) => void;

export interface Ejecutor {
  suscripcion: Suscripcion;
  ejecutar(solicitud: SolicitudEjecucion, alEvento?: AlEvento): Promise<ResultadoEjecucion>;
}

/** Lee la salida NDJSON de un CLI línea por línea. No toca procesos, para poder probarlo con grabaciones. */
export interface Traductor {
  procesar(linea: string): Evento[];
  resultado(): ResultadoEjecucion;
}
