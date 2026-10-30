import { z } from "zod";

/**
 * JSON Schema para el flag --json-schema de claude y agy. Las reglas de .superRefine no
 * se pueden exportar: la respuesta se vuelve a validar con el esquema completo.
 */
export function aJsonSchema(esquema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...resto } = z.toJSONSchema(esquema) as Record<string, unknown>;
  return resto;
}
