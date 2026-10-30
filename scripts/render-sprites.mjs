#!/usr/bin/env node
// Renderiza los sprites de docs/personajes/sprites.json a una hoja PNG para revisarlos
// sin abrir la oficina. Sin dependencias: el PNG se arma a mano con zlib.
//
// Uso: node scripts/render-sprites.mjs [--escala 8] [--salida docs/personajes/hoja.png]

import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : porDefecto;
};

const escala = Number(opcion("escala", 8));
const salida = join(raiz, opcion("salida", "docs/personajes/hoja.png"));
const { personajes } = JSON.parse(readFileSync(join(raiz, "docs/personajes/sprites.json"), "utf8"));

// Dos fondos (claro y oscuro) para comprobar que cada personaje se lee en los dos temas.
const fondos = ["#E8E2D4", "#2E3440"];
const margen = 2 * escala;
const celdaAncho = Math.max(...personajes.map((p) => p.data[0].length)) * escala + margen * 2;
const celdaAlto = Math.max(...personajes.map((p) => p.data.length)) * escala + margen * 2;
const ancho = celdaAncho * personajes.length;
const alto = celdaAlto * fondos.length;

const hexARgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const pixeles = Buffer.alloc(ancho * alto * 4);
const pintar = (x, y, [r, g, b]) => {
  const i = (y * ancho + x) * 4;
  pixeles[i] = r;
  pixeles[i + 1] = g;
  pixeles[i + 2] = b;
  pixeles[i + 3] = 255;
};

fondos.forEach((fondo, fila) => {
  for (let y = fila * celdaAlto; y < (fila + 1) * celdaAlto; y++) {
    for (let x = 0; x < ancho; x++) pintar(x, y, hexARgb(fondo));
  }
  personajes.forEach((p, col) => {
    p.data.forEach((linea, sy) => {
      [...linea].forEach((clave, sx) => {
        if (clave === "." || clave === " ") return;
        const color = p.paleta[clave];
        if (!color) throw new Error(`${p.id}: la clave '${clave}' no está en la paleta`);
        for (let dy = 0; dy < escala; dy++) {
          for (let dx = 0; dx < escala; dx++) {
            pintar(col * celdaAncho + margen + sx * escala + dx, fila * celdaAlto + margen + sy * escala + dy, hexARgb(color));
          }
        }
      });
    });
  });
});

// --- Codificación PNG (RGBA de 8 bits, sin filtro) ---
const tablaCrc = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = tablaCrc[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const bloque = (tipo, datos) => {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
};

const cabecera = Buffer.alloc(13);
cabecera.writeUInt32BE(ancho, 0);
cabecera.writeUInt32BE(alto, 4);
cabecera[8] = 8; // bits por canal
cabecera[9] = 6; // RGBA

const filas = Buffer.alloc((ancho * 4 + 1) * alto);
for (let y = 0; y < alto; y++) {
  filas[y * (ancho * 4 + 1)] = 0;
  pixeles.copy(filas, y * (ancho * 4 + 1) + 1, y * ancho * 4, (y + 1) * ancho * 4);
}

writeFileSync(
  salida,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque("IHDR", cabecera),
    bloque("IDAT", deflateSync(filas)),
    bloque("IEND", Buffer.alloc(0)),
  ]),
);
console.log(`Hoja de ${personajes.length} personajes escrita en ${salida} (${ancho}x${alto})`);
