import { lstat, mkdir, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const target = new URL("dist/dev/ouw25/", root);
await mkdir(target, { recursive: true });

for (const name of ["module", "templates", "styles", "lang"]) {
  const source = fileURLToPath(new URL(`${name}/`, root)).replace(/\/$/, "");
  const link = new URL(name, target);
  try {
    const stat = await lstat(link);
    if (!stat.isSymbolicLink() || await readlink(link) !== source) {
      throw new Error(`Refusing to replace ${fileURLToPath(link)}`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await symlink(source, link, "dir");
  }
}

const manifest = JSON.parse(await readFile(new URL("system.json", root), "utf8"));
delete manifest.manifest;
delete manifest.download;
manifest.flags = {
  ...manifest.flags,
  hotReload: { extensions: ["css", "hbs", "json"], paths: ["styles", "templates", "lang"] }
};
await writeFile(new URL("system.json", target), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared ${fileURLToPath(target)}`);
