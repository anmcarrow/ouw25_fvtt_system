import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { initializeStarterScene } from "../dist/ouw25/module/starter-scene.mjs";

function fixture(t, { tour = "unstarted", playtime = 0, shownTips = false, gm = true } = {}) {
  const hooks = new Map();
  const created = [];
  globalThis.Hooks = {
    on(name, callback) { hooks.set(name, callback); return callback; },
    off(name, callback) { if (hooks.get(name) === callback) hooks.delete(name); }
  };
  globalThis.foundry = {
    nue: { Tour: { STATUS: { UNSTARTED: "unstarted" } } },
    data: { operators: { ForcedReplacement: { create: value => ({ replace: value }) } } }
  };
  globalThis.game = {
    user: { id: "gm", isActiveGM: gm }, world: { playtime },
    actors: new Map(), scenes: new Map(), items: new Map(), journal: new Map(),
    settings: { get: () => shownTips }, tours: { get: () => ({ status: tour }) },
    i18n: { localize: key => key }
  };
  globalThis.Scene = { create: async data => { created.push(data); return data; } };
  globalThis.ui = { notifications: { error() {} } };
  t.after(() => {
    for (const name of ["Hooks", "foundry", "game", "Scene", "ui"]) delete globalThis[name];
  });
  return { hooks, created };
}

test("first launch uses the existing Foundry welcome scene creation", async t => {
  const { hooks, created } = fixture(t);
  initializeStarterScene();
  const hook = hooks.get("preCreateScene");
  assert.ok(hook);
  assert.equal(created.length, 0);
  const scene = { id: "NUEDEFAULTSCENE0", active: true, updateSource(data) { this.data = data; } };
  hook(scene, {}, { keepId: false }, "gm");
  hook(scene, {}, { keepId: true }, "other-user");
  hook({ id: "other" }, {}, { keepId: true }, "gm");
  assert.equal(scene.data, undefined);
  hook(scene, {}, { keepId: true }, "gm");
  assert.equal(scene.active, true);
  assert.equal(scene.data.name, "Set sail");
  assert.deepEqual(scene.data.tiles, { replace: [] });
  assert.deepEqual(scene.data.lights, { replace: [] });
  assert.equal(scene.data.levels[0].background.src, "systems/ouw25/styles/images/the_seah_bgr.webp");
  assert.equal(hooks.has("preCreateScene"), false);
  for (const path of [scene.data.thumb, scene.data.levels[0].background.src]) {
    const bytes = await readFile(new URL(`../dist/ouw25/${path.slice("systems/ouw25/".length)}`, import.meta.url));
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  }
});

test("without an unstarted welcome tour the first GM creates one active starter scene", async t => {
  const { hooks, created } = fixture(t, { tour: "completed" });
  await initializeStarterScene();
  assert.equal(hooks.size, 0);
  assert.equal(created.length, 1);
  assert.equal(created[0].name, "Set sail");
  assert.equal(created[0].active, true);
  assert.equal(created[0].levels[0].background.src, "systems/ouw25/styles/images/the_seah_bgr.webp");
});

test("first-launch safeguards leave existing or populated worlds untouched", async t => {
  const { hooks, created } = fixture(t);
  for (const field of ["actors", "scenes", "items", "journal"]) {
    game[field].set("existing", {});
    await initializeStarterScene();
    game[field].clear();
  }
  game.world.playtime = 1;
  await initializeStarterScene();
  game.world.playtime = 0;
  game.settings.get = () => true;
  await initializeStarterScene();
  game.settings.get = () => false;
  game.user.isActiveGM = false;
  await initializeStarterScene();
  assert.equal(hooks.size, 0);
  assert.equal(created.length, 0);
});

test("welcome scene is not replaced if the world becomes populated while it loads", t => {
  const { hooks } = fixture(t);
  initializeStarterScene();
  game.scenes.set("new", {});
  const scene = { id: "NUEDEFAULTSCENE0", updateSource() { assert.fail("scene should not be changed"); } };
  hooks.get("preCreateScene")(scene, {}, { keepId: true }, "gm");
  assert.equal(hooks.has("preCreateScene"), false);
});
