import type { Suscripcion } from "@orquesta/contratos";
import { fabricaDeEventos, resumir } from "./eventos.ts";
import { correrProceso } from "./proceso.ts";
import type { AlEvento, ResultadoEjecucion, SolicitudEjecucion, Traductor } from "./tipos.ts";

const tiempoLimitePorDefectoMs = 10 * 60 * 1000;

export interface Invocacion {
  comando: string;
  args: string[];
  entrada: string;
  suscripcion: Suscripcion;
  traductor: Traductor;
  /** Tiempo extra antes de matar el proceso, para CLIs que tienen su propio límite. */
  margenMs?: number;
}

/** Corre el CLI, traduce su salida a eventos y cierra siempre con `agente_fin`. */
export async function ejecutarConTraductor(
  solicitud: SolicitudEjecucion,
  invocacion: Invocacion,
  alEvento: AlEvento = () => {},
): Promise<ResultadoEjecucion> {
  const tiempoLimiteMs = (solicitud.tiempoLimiteMs ?? tiempoLimitePorDefectoMs) + (invocacion.margenMs ?? 0);
  const inicio = Date.now();
  let resultado: ResultadoEjecucion;

  try {
    const salida = await correrProceso(invocacion.comando, invocacion.args, {
      entrada: invocacion.entrada,
      directorio: solicitud.directorio,
      tiempoLimiteMs,
      alLinea: (linea) => invocacion.traductor.procesar(linea).forEach(alEvento),
    });
    resultado = invocacion.traductor.resultado();
    if (salida.agotado) {
      resultado = { ...resultado, estado: "tiempo_agotado", error: `No terminó en ${tiempoLimiteMs} ms` };
    } else if (resultado.estado === "error" && !resultado.error) {
      resultado = { ...resultado, error: salida.stderr.trim() ? resumir(salida.stderr, 300) : `Terminó con código ${salida.codigo} y sin resultado` };
    }
  } catch (error) {
    resultado = {
      estado: "error",
      respuesta: "",
      tokens: { entrada: 0, salida: 0 },
      duracionMs: 0,
      error: `No se pudo ejecutar ${invocacion.comando}: ${(error as Error).message}`,
      denegaciones: [],
    };
  }
  if (!resultado.duracionMs) resultado = { ...resultado, duracionMs: Date.now() - inicio };

  const evento = fabricaDeEventos(solicitud.contexto, solicitud.modelo, invocacion.suscripcion);
  if (resultado.estado === "cuota_agotada") {
    alEvento(evento("fuera_de_turno", { detalle: resultado.error }));
  } else if (resultado.estado !== "exito") {
    alEvento(evento("error", { detalle: resultado.error ?? (resultado.estado === "vacio" ? "Respuesta vacía" : resultado.estado) }));
  }
  alEvento(evento("agente_fin", { detalle: resultado.estado, tokens: resultado.tokens }));
  return resultado;
}
