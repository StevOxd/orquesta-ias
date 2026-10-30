import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface OpcionesProceso {
  /** Se escribe completa por stdin y luego se cierra. */
  entrada: string;
  directorio: string;
  tiempoLimiteMs: number;
  alLinea: (linea: string) => void;
}

export interface SalidaProceso {
  codigo: number | null;
  stderr: string;
  agotado: boolean;
}

const maximoStderr = 20_000;

export function correrProceso(comando: string, args: string[], opciones: OpcionesProceso): Promise<SalidaProceso> {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(comando, args, { cwd: opciones.directorio, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    let agotado = false;

    const temporizador = setTimeout(() => {
      agotado = true;
      hijo.kill("SIGTERM");
    }, opciones.tiempoLimiteMs);

    createInterface({ input: hijo.stdout }).on("line", (linea) => {
      if (linea.trim()) opciones.alLinea(linea);
    });
    hijo.stderr.on("data", (trozo: Buffer) => {
      if (stderr.length < maximoStderr) stderr += trozo.toString();
    });
    // Si el CLI termina antes de leer todo stdin, la escritura falla con EPIPE; no es un error del ejecutor.
    hijo.stdin.on("error", () => {});

    hijo.on("error", (error) => {
      clearTimeout(temporizador);
      rechazar(error);
    });
    hijo.on("close", (codigo) => {
      clearTimeout(temporizador);
      resolver({ codigo, stderr, agotado });
    });

    hijo.stdin.end(opciones.entrada);
  });
}
