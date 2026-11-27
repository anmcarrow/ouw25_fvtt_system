import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { registerDiceTheme } from "../dist/ouw25/module/dice-theme.mjs";

test("the optional Dice So Nice theme provides default dice without changing saved preferences", async () => {
  const manifest = JSON.parse(await readFile(new URL("../dist/ouw25/system.json", import.meta.url)));
  assert.ok(manifest.relationships.recommends.some(({ id, type }) => id === "dice-so-nice" && type === "module"));
  assert.ok(!manifest.relationships.requires?.some(({ id }) => id === "dice-so-nice"));

  const calls = [];
  registerDiceTheme({
    addColorset: theme => { calls.push(["theme", theme]); return Promise.resolve(); },
    addRole: (role, options) => calls.push(["role", role, options])
  });
  const theme = calls[0][1];
  assert.equal(theme.name, calls[1][1].defaults.global.colorset);
  assert.equal(calls[1][1].id, "basic");
  assert.equal(calls[1][2].package, "ouw25");
  assert.equal(theme.font, "Viaoda Libre");
  assert.equal(theme.material, "glass");
  assert.match(theme.background, /^#[0-9a-f]{6}[0-9a-f]{2}$/);
  assert.equal(theme.foreground, "#edcd79");
  for (const language of ["en", "ru"]) {
    const translations = JSON.parse(await readFile(new URL(`../dist/ouw25/lang/${language}.json`, import.meta.url)));
    assert.ok(translations.OUW25.DiceTheme);
  }
});
