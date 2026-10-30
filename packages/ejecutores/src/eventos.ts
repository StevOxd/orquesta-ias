import type { Evento, Suscripcion, TipoEvento } from "@orquesta/contratos";
import type { ContextoEjecucion } from "./tipos.ts";

export type Reloj = () => string;
export const relojDelSistema: Reloj = () => new Date().toISOString();

type Extra = Partial<Pick<Evento, "detalle" | "tokens" | "cuota">>;

export function fabricaDeEventos(
  contexto: ContextoEjecucion,
  modelo: string,
  suscripcion: Suscripcion,
  reloj: Reloj = relojDelSistema,
) {
  return (tipo: TipoEvento, extra: Extra = {}): Evento => ({
    ts: reloj(),
    trabajo: contexto.trabajo,
    fase: contexto.fase,
    agente: contexto.agente,
    rol: contexto.rol,
    modelo,
    suscripcion,
    tipo,
    ...extra,
  });
}

export function resumir(texto: string, maximo = 160): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > maximo ? `${limpio.slice(0, maximo - 1)}…` : limpio;
}

// Parámetros que mejor describen una llamada, en los nombres que usan claude y agy.
const parametrosRepresentativos = ["file_path", "path", "command", "CommandLine", "pattern", "AbsolutePath", "url", "query"];

export function resumirHerramienta(nombre: string, parametros: unknown): string {
  if (parametros && typeof parametros === "object") {
    const valores = parametros as Record<string, unknown>;
    const clave =
      parametrosRepresentativos.find((c) => typeof valores[c] === "string") ??
      Object.keys(valores).find((c) => typeof valores[c] === "string");
    if (clave) return `${nombre}: ${resumir(String(valores[clave]), 100)}`;
  }
  return nombre;
}

export function analizarLinea<T>(linea: string): T | undefined {
  try {
    return JSON.parse(linea) as T;
  } catch {
    return undefined;
  }
}
