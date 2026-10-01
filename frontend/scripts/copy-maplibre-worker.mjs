// MapLibre 6 starts a module worker (maplibre-gl-worker.mjs, which imports maplibre-gl-shared.mjs)
// that Turbopack does not bundle or emit. We copy both files into public/ and RouteMap.tsx points
// maplibregl.setWorkerUrl at the copies. Generated output; public/maplibre/ is git-ignored.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const root = new URL("..", import.meta.url);
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];
const target = new URL("public/maplibre/", root);

for (const file of files) {
  const source = new URL(`node_modules/maplibre-gl/dist/${file}`, root);
  if (!existsSync(source)) {
    console.error(`copy-maplibre-worker: missing ${source.pathname}. Run pnpm install first.`);
    process.exit(1);
  }
}

mkdirSync(target, { recursive: true });
for (const file of files) {
  copyFileSync(new URL(`node_modules/maplibre-gl/dist/${file}`, root), new URL(file, target));
}
console.log("Copied MapLibre worker to public/maplibre/");
