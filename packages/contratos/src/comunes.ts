import { z } from "zod";

/** Áreas por las que pasa un trabajo (docs/diseno.md, sección 6). */
export const fases = ["necesidad", "analisis", "diseno", "desarrollo", "qa", "entrega"] as const;
export const esquemaFase = z.enum(fases);
export type Fase = z.infer<typeof esquemaFase>;

/** Quién paga una ejecución. */
export const esquemaSuscripcion = z.enum(["claude", "antigravity"]);
export type Suscripcion = z.infer<typeof esquemaSuscripcion>;

export const esquemaIdTrabajo = z.string().regex(/^T-\d{4}$/, "Debe tener el formato T-0001");
export const esquemaIdTarea = z.string().regex(/^TA-\d+$/, "Debe tener el formato TA-1");
export const esquemaIdCriterio = z.string().regex(/^CA-\d+$/, "Debe tener el formato CA-1");

export const esquemaTokens = z.strictObject({
  entrada: z.number().int().nonnegative(),
  salida: z.number().int().nonnegative(),
});
export type Tokens = z.infer<typeof esquemaTokens>;
