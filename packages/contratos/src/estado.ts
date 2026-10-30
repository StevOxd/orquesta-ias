import { z } from "zod";
import { esquemaFase, esquemaIdTrabajo, esquemaSuscripcion, esquemaTokens } from "./comunes.ts";

/** Estados de la máquina de estados de un trabajo (docs/diseno.md, sección 6). */
export const estadosDeTrabajo = [
  "necesidad",
  "analisis",
  "aprobacion_requerimiento",
  "diseno",
  "desarrollo",
  "qa",
  "bloqueado",
  "aprobacion_entrega",
  "entregado",
] as const;

export const esquemaPasoHistorial = z.strictObject({
  fase: esquemaFase,
  rol: z.string().min(1),
  modelo: z.string().min(1),
  suscripcion: esquemaSuscripcion,
  inicio: z.iso.datetime(),
  fin: z.iso.datetime(),
  tokens: esquemaTokens,
});

/** Forma de estado.json. */
export const esquemaEstado = z.strictObject({
  trabajo: esquemaIdTrabajo,
  carril: z.enum(["completo", "rapido"]),
  fase: z.enum(estadosDeTrabajo),
  ciclos_qa: z.number().int().nonnegative(),
  historial: z.array(esquemaPasoHistorial),
});
export type Estado = z.infer<typeof esquemaEstado>;
