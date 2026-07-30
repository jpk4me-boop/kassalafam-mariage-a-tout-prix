/**
 * Génération des icônes PWA KASSALAFAM depuis les sources SVG de public/brand.
 *
 * Produit :
 *   public/icon-192.png, public/icon-512.png          (icône « any »)
 *   public/icon-maskable-192.png, public/icon-maskable-512.png
 *   public/apple-touch-icon.png                       (180×180, fond opaque)
 *   src/app/favicon.ico                               (16/32/48)
 *
 * La police Playfair Display est chargée depuis node_modules
 * (@fontsource/playfair-display). Le paquet ne publie que des WOFF/WOFF2 :
 * le WOFF2 est décompressé en TTF via wawoff2 (resvg n'accepte que TTF/OTF,
 * chargé par chemin de fichier — le TTF intermédiaire va dans
 * node_modules/.cache). Aucun accès réseau.
 *
 * Usage : npm run generate:icons
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";
import wawoff2 from "wawoff2";
import pngToIco from "png-to-ico";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FONT_WOFF2 = path.join(
  root,
  "node_modules",
  "@fontsource",
  "playfair-display",
  "files",
  "playfair-display-latin-600-normal.woff2",
);

const SOURCE_ICON = path.join(root, "public", "brand", "icon-source.svg");
const SOURCE_MASKABLE = path.join(
  root,
  "public",
  "brand",
  "icon-maskable-source.svg",
);

/** Lit la largeur/hauteur d'un PNG dans son en-tête IHDR. */
function pngSize(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function renderPng(svg, size, fontFile) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    font: {
      fontFiles: [fontFile],
      loadSystemFonts: false,
      defaultFontFamily: "Playfair Display",
    },
  });
  return Buffer.from(resvg.render().asPng());
}

async function main() {
  const woff2 = await readFile(FONT_WOFF2);
  const ttfBuffer = Buffer.from(await wawoff2.decompress(woff2));
  const cacheDir = path.join(root, "node_modules", ".cache", "kassalafam-icons");
  await mkdir(cacheDir, { recursive: true });
  const ttf = path.join(cacheDir, "playfair-display-latin-600-normal.ttf");
  await writeFile(ttf, ttfBuffer);

  const iconSvg = await readFile(SOURCE_ICON, "utf8");
  const maskableSvg = await readFile(SOURCE_MASKABLE, "utf8");

  await mkdir(path.join(root, "public"), { recursive: true });

  const outputs = [
    ["public/icon-192.png", renderPng(iconSvg, 192, ttf), 192],
    ["public/icon-512.png", renderPng(iconSvg, 512, ttf), 512],
    ["public/icon-maskable-192.png", renderPng(maskableSvg, 192, ttf), 192],
    ["public/icon-maskable-512.png", renderPng(maskableSvg, 512, ttf), 512],
    // Apple touch : iOS applique lui-même son masque arrondi — on part du
    // dessin pleine surface (fond opaque, marges sûres), rendu en 180×180.
    ["public/apple-touch-icon.png", renderPng(maskableSvg, 180, ttf), 180],
  ];

  for (const [relPath, buffer, expected] of outputs) {
    const { width, height } = pngSize(buffer);
    if (width !== expected || height !== expected) {
      throw new Error(
        `${relPath}: dimensions ${width}×${height}, attendu ${expected}×${expected}`,
      );
    }
    await writeFile(path.join(root, relPath), buffer);
    console.log(`OK ${relPath} (${width}×${height})`);
  }

  const favicon = await pngToIco(
    [16, 32, 48].map((size) => renderPng(iconSvg, size, ttf)),
  );
  await writeFile(path.join(root, "src", "app", "favicon.ico"), favicon);
  console.log(`OK src/app/favicon.ico (16/32/48, ${favicon.length} octets)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
