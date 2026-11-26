import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const script = new URL("../scripts/dev-prepare.mjs", import.meta.url);

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "ouw25-dev-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "scripts"));
  await cp(script, path.join(root, "scripts", "dev-prepare.mjs"));
  for (const name of ["module", "templates", "styles", "lang"]) await mkdir(path.join(root, name));
  await writeFile(path.join(root, "system.json"), JSON.stringify({
    id: "ouw25", manifest: "https://example.test/manifest", download: "https://example.test/download",
    flags: { other: true }
  }));
  return root;
}

test("dev package links sources and uses a separate reload-enabled manifest", async t => {
  const root = await fixture(t);
  const run = () => execFileAsync(process.execPath, [path.join(root, "scripts", "dev-prepare.mjs")]);
  await run();
  await run();
  const target = path.join(root, "dist", "dev", "ouw25");
  const manifest = JSON.parse(await readFile(path.join(target, "system.json"), "utf8"));
  assert.equal(manifest.manifest, undefined);
  assert.equal(manifest.download, undefined);
  assert.equal(manifest.flags.other, true);
  assert.deepEqual(manifest.flags.hotReload.extensions, ["css", "hbs", "json"]);
  for (const name of ["module", "templates", "styles", "lang"]) {
    assert.equal(await realpath(path.join(target, name)), await realpath(path.join(root, name)));
  }
});

test("dev preparation refuses to replace an existing source directory", async t => {
  const root = await fixture(t);
  const existing = path.join(root, "dist", "dev", "ouw25", "module");
  await mkdir(existing, { recursive: true });
  await assert.rejects(execFileAsync(process.execPath, [path.join(root, "scripts", "dev-prepare.mjs")]),
    error => error.stderr.includes("Refusing to replace"));
  assert.equal((await lstat(existing)).isDirectory(), true);
});
