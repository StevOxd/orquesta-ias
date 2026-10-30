// Imita un CLI en las pruebas: lee stdin, repite una grabación por stdout y espera antes de terminar.
// Uso: node cli-falso.mjs <grabacion.ndjson> [esperaMs]
import { readFileSync } from "node:fs";

const [grabacion, esperaMs = "0"] = process.argv.slice(2);
process.stdin.resume();
process.stdin.on("end", () => {
  process.stdout.write(readFileSync(grabacion, "utf8"));
  setTimeout(() => {}, Number(esperaMs));
});
