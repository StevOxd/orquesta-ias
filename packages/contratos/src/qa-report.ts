import { z } from "zod";
import { esquemaIdCriterio, esquemaIdTrabajo } from "./comunes.ts";

/** Un criterio se cumple solo si un comando lo demuestra. */
export const esquemaEvidencia = z.strictObject({
  comando: z.string().min(1),
  salida: z.string(),
  codigo_salida: z.number().int(),
});

export const esquemaCriterioQa = z.strictObject({
  id: esquemaIdCriterio,
  estado: z.enum(["cumple", "no_cumple"]),
  evidencia: esquemaEvidencia,
  hallazgo: z.string().min(1).optional(),
});

/** Forma de qa-report.json. Es la que se le pide al modelo con --json-schema. */
export const esquemaQaReport = z.strictObject({
  trabajo: esquemaIdTrabajo,
  veredicto: z.enum(["pasa", "falla"]),
  criterios: z.array(esquemaCriterioQa).min(1),
  revisor: z.strictObject({
    rol: z.string().min(1),
    modelo: z.string().min(1),
  }),
});
export type QaReport = z.infer<typeof esquemaQaReport>;

/** Además de la forma, revisa que el veredicto sea coherente con los criterios. */
export const esquemaQaReportValido = esquemaQaReport.superRefine((reporte, ctx) => {
  const ids = new Set<string>();
  reporte.criterios.forEach((criterio, i) => {
    if (ids.has(criterio.id)) {
      ctx.addIssue({ code: "custom", message: `El criterio ${criterio.id} está repetido`, path: ["criterios", i, "id"] });
    }
    ids.add(criterio.id);
    if (criterio.estado === "no_cumple" && !criterio.hallazgo) {
      ctx.addIssue({ code: "custom", message: `${criterio.id} no se cumple pero no explica el hallazgo`, path: ["criterios", i, "hallazgo"] });
    }
  });

  const algunoFalla = reporte.criterios.some((criterio) => criterio.estado === "no_cumple");
  if (reporte.veredicto === "pasa" && algunoFalla) {
    ctx.addIssue({ code: "custom", message: "El veredicto es «pasa» pero hay criterios que no se cumplen", path: ["veredicto"] });
  }
  if (reporte.veredicto === "falla" && !algunoFalla) {
    ctx.addIssue({ code: "custom", message: "El veredicto es «falla» pero todos los criterios se cumplen", path: ["veredicto"] });
  }
});
