/**
 * requerimiento.md es Markdown con secciones `## ` fijas (docs/diseno.md, sección 7).
 *
 * Cada criterio de aceptación va en un elemento de lista con este formato:
 *   - CA-1: <qué se cumple>. Verificación: <cómo se comprueba>
 *
 * En "Preguntas abiertas", cada pregunta es un elemento de lista; "Ninguna" significa que no hay.
 */
export const seccionesRequerimiento = [
  "Objetivo",
  "Alcance",
  "Criterios de aceptación",
  "Riesgos",
  "Preguntas abiertas",
] as const;

export interface RevisionRequerimiento {
  seccionesFaltantes: string[];
  criterios: string[];
  criteriosSinVerificacion: string[];
  preguntasAbiertas: string[];
  /** La compuerta solo pasa si el documento está completo y no quedan preguntas abiertas. */
  puedeAvanzar: boolean;
}

const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

const elementosDeLista = (lineas: string[] = []) =>
  lineas
    .map((linea) => /^\s*[-*]\s+(.+)$/.exec(linea)?.[1]?.trim())
    .filter((elemento): elemento is string => Boolean(elemento));

export function revisarRequerimiento(markdown: string): RevisionRequerimiento {
  const secciones = new Map<string, string[]>();
  let actual: string[] | undefined;
  for (const linea of markdown.split(/\r?\n/)) {
    const titulo = /^##\s+(.+?)\s*$/.exec(linea);
    if (titulo) {
      actual = [];
      secciones.set(normalizar(titulo[1] ?? ""), actual);
    } else {
      actual?.push(linea);
    }
  }
  const seccion = (nombre: string) => secciones.get(normalizar(nombre));

  const seccionesFaltantes = seccionesRequerimiento.filter((nombre) => !seccion(nombre));

  const criterios: string[] = [];
  const criteriosSinVerificacion: string[] = [];
  for (const elemento of elementosDeLista(seccion("Criterios de aceptación"))) {
    const id = /^\**(CA-\d+)\**/.exec(elemento)?.[1];
    if (!id) continue;
    criterios.push(id);
    if (!normalizar(elemento).includes("verificacion:")) criteriosSinVerificacion.push(id);
  }

  const preguntasAbiertas = elementosDeLista(seccion("Preguntas abiertas")).filter(
    (pregunta) => !/^ninguna\b/.test(normalizar(pregunta)),
  );

  return {
    seccionesFaltantes,
    criterios,
    criteriosSinVerificacion,
    preguntasAbiertas,
    puedeAvanzar:
      seccionesFaltantes.length === 0 &&
      criterios.length > 0 &&
      criteriosSinVerificacion.length === 0 &&
      preguntasAbiertas.length === 0,
  };
}
