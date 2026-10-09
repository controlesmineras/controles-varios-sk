import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = "/controles-varios-sk/";
const out = path.resolve("out");
const html = await readFile(path.join(out, "index.html"), "utf8");
const worker = await readFile("public/sw.js", "utf8");
const assets = new Set([root]);
const hash = createHash("sha256").update(html).update(worker);

async function collect(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(filename);
    else if (entry.name !== "sw.js" && /\.(js|css|woff2?|ttf|png|jpe?g|svg|ico|webmanifest)$/.test(entry.name)) {
      assets.add(root + path.relative(out, filename).split(path.sep).join("/"));
      hash.update(filename.slice(out.length)).update(await readFile(filename));
    }
  }
}
await collect(out);
// Preserve versioned URLs used by Next and the configuration/installation scripts.
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = match[1].replaceAll("&amp;", "&");
  if (url.startsWith(root)) assets.add(url);
}
const urls = [...assets].sort();
if (!urls.some(url => url.includes("/_next/static/") && url.endsWith(".js"))) {
  throw new Error("No se encontraron los scripts de la app para el arranque sin conexión.");
}
await writeFile(path.join(out, "sw.js"), worker
  .replace("__BUILD_ID__", hash.digest("hex").slice(0, 16))
  .replace("/* OFFLINE_ASSETS */ [ROOT]", JSON.stringify(urls)));
console.log(`Arranque sin conexión preparado: ${urls.length} archivos, incluida la configuración.`);
