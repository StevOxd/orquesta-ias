import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Evento } from "@orquesta/contratos";
import type { SolicitudEjecucion, Traductor } from "../src/tipos.ts";

export const relojFijo = () => "2026-10-30T12:00:00.000Z";

export const solicitudDePrueba = (cambios: Partial<SolicitudEjecucion> = {}): SolicitudEjecucion => ({
  contexto: { trabajo: "T-0001", fase: "qa", rol: "qa-api", agente: "qa-api#1" },
  modelo: "modelo-de-prueba",
  prompt: "Revisa el archivo.",
  directorio: "/tmp/proyecto",
  modo: "lectura",
  ...cambios,
});

// fileURLToPath y no .pathname: la carpeta del repo tiene un espacio ("Orquesta IAs").
export const rutaGrabacion = (nombre: string) => fileURLToPath(new URL(`./fixtures/${nombre}`, import.meta.url));

/** Pasa una grabación real por el traductor, como si llegara del CLI. */
export function reproducir(traductor: Traductor, grabacion: string): Evento[] {
  return readFileSync(rutaGrabacion(grabacion), "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((linea) => traductor.procesar(linea));
}
