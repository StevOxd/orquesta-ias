import { z } from "zod";
import { esquemaIdCriterio, esquemaIdTarea, esquemaIdTrabajo } from "./comunes.ts";

export const esquemaTarea = z.strictObject({
  id: esquemaIdTarea,
  titulo: z.string().min(1),
  rol: z.string().min(1),
  /** El router usa este campo para elegir el modelo. */
  tipo: z.enum(["mecanico", "complejo"]),
  archivos: z.array(z.string().min(1)),
  criterios: z.array(esquemaIdCriterio).min(1),
  depende_de: z.array(esquemaIdTarea),
});
export type Tarea = z.infer<typeof esquemaTarea>;

/** Forma de tareas.json. Es la que se le pide al modelo con --json-schema. */
export const esquemaTareas = z.strictObject({
  trabajo: esquemaIdTrabajo,
  tareas: z.array(esquemaTarea).min(1),
});
export type Tareas = z.infer<typeof esquemaTareas>;

/** Además de la forma, revisa las reglas entre tareas, que JSON Schema no puede expresar. */
export const esquemaTareasValidas = esquemaTareas.superRefine((plan, ctx) => {
  const ids = new Set<string>();
  plan.tareas.forEach((tarea, i) => {
    if (ids.has(tarea.id)) {
      ctx.addIssue({ code: "custom", message: `La tarea ${tarea.id} está repetida`, path: ["tareas", i, "id"] });
    }
    ids.add(tarea.id);
  });

  plan.tareas.forEach((tarea, i) => {
    for (const dependencia of tarea.depende_de) {
      if (dependencia === tarea.id) {
        ctx.addIssue({ code: "custom", message: `${tarea.id} depende de sí misma`, path: ["tareas", i, "depende_de"] });
      } else if (!ids.has(dependencia)) {
        ctx.addIssue({ code: "custom", message: `${tarea.id} depende de ${dependencia}, que no existe`, path: ["tareas", i, "depende_de"] });
      }
    }
  });

  const ciclo = buscarCiclo(plan.tareas);
  if (ciclo) {
    ctx.addIssue({ code: "custom", message: `Las dependencias forman un ciclo: ${ciclo.join(" → ")}`, path: ["tareas"] });
  }
});

function buscarCiclo(tareas: Tarea[]): string[] | undefined {
  const dependencias = new Map(tareas.map((tarea) => [tarea.id, tarea.depende_de]));
  const estado = new Map<string, "visitando" | "listo">();
  const camino: string[] = [];

  const visitar = (id: string): string[] | undefined => {
    if (estado.get(id) === "listo") return undefined;
    if (estado.get(id) === "visitando") return [...camino.slice(camino.indexOf(id)), id];
    estado.set(id, "visitando");
    camino.push(id);
    for (const siguiente of dependencias.get(id) ?? []) {
      // Las autodependencias y las dependencias inexistentes ya se reportan aparte.
      if (siguiente === id || !dependencias.has(siguiente)) continue;
      const ciclo = visitar(siguiente);
      if (ciclo) return ciclo;
    }
    camino.pop();
    estado.set(id, "listo");
    return undefined;
  };

  for (const id of dependencias.keys()) {
    const ciclo = visitar(id);
    if (ciclo) return ciclo;
  }
  return undefined;
}
