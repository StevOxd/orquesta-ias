import type { Suscripcion } from "@orquesta/contratos";
import { ejecutorAgy } from "./agy.ts";
import { ejecutorClaude } from "./claude.ts";
import type { Ejecutor } from "./tipos.ts";

export * from "./agy.ts";
export * from "./claude.ts";
export * from "./ejecutar.ts";
export * from "./eventos.ts";
export type * from "./tipos.ts";

export const ejecutores: Record<Suscripcion, Ejecutor> = {
  claude: ejecutorClaude,
  antigravity: ejecutorAgy,
};
