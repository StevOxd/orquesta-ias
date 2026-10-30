import { z } from "zod";

/** Forma de .orquesta/proyecto.yaml (docs/diseno.md, sección 7). */
export const esquemaProyecto = z.strictObject({
  nombre: z.string().min(1),
  tipos: z.array(z.enum(["servicio", "infraestructura", "frontend"])).min(1),
  /** `rama` cuando el proyecto no puede levantar una copia aislada (ver sección 10). */
  aislamiento: z.enum(["rama", "worktree"]),
  /** Rutas que nunca se envían a un modelo. */
  excluir: z.array(z.string().min(1)),
  /** Archivos de reglas que el ejecutor incluye en el prompt de cada rol. */
  reglas: z.array(z.string().min(1)),
  equipo: z.array(z.string().min(1)).min(1),
  comandos_qa: z.array(z.string().min(1)),
});
export type Proyecto = z.infer<typeof esquemaProyecto>;
