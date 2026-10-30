import { z } from "zod";
import { esquemaFase, esquemaIdTrabajo, esquemaSuscripcion, esquemaTokens } from "./comunes.ts";

export const tiposDeEvento = [
  "fase_iniciada",
  "agente_inicio",
  "herramienta",
  "mensaje",
  "agente_fin",
  "error",
  "esperando_aprobacion",
  "aprobado",
  "rechazado",
  "fuera_de_turno",
  "cuota",
  "contratacion",
] as const;
export type TipoEvento = (typeof tiposDeEvento)[number];

/** Uso de una ventana de límite de una suscripción (por ejemplo, la de 5 horas de Claude). */
export const esquemaVentanaCuota = z.strictObject({
  ventana: z.string().min(1),
  uso: z.number().min(0).max(1),
  reinicia: z.iso.datetime(),
});

/**
 * Una línea de eventos.jsonl. Los eventos del motor (fases y compuertas) no tienen agente;
 * los de los ejecutores siempre llevan agente, rol, modelo y suscripción.
 */
export const esquemaEvento = z.strictObject({
  ts: z.iso.datetime(),
  trabajo: esquemaIdTrabajo,
  fase: esquemaFase,
  agente: z.string().min(1).optional(),
  rol: z.string().min(1).optional(),
  modelo: z.string().min(1).optional(),
  suscripcion: esquemaSuscripcion.optional(),
  tipo: z.enum(tiposDeEvento),
  detalle: z.string().optional(),
  tokens: esquemaTokens.optional(),
  cuota: z.array(esquemaVentanaCuota).optional(),
});
export type Evento = z.infer<typeof esquemaEvento>;
