import { cp, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const target = new URL("dist/ouw25/", root);
await mkdir(target, { recursive: true });

for (const path of ["system.json", "module", "templates", "styles", "lang"]) {
  await cp(new URL(path, root), new URL(path, target), { recursive: true });
}

console.log("Built dist/ouw25");
