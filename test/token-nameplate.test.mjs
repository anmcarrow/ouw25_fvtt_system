import assert from "node:assert/strict";
import test from "node:test";

const { configureTokenNameplates } = await import("../dist/ouw25/module/token-nameplate.mjs");

test("token nameplates use Alice after both alphabets load and after refresh", async () => {
  const hooks = new Map();
  globalThis.Hooks = { on: (event, callback) => hooks.set(event, callback) };
  let finishLoading;
  let requested;
  globalThis.document = { fonts: { load: (...args) => {
    requested = args;
    return new Promise(resolve => { finishLoading = resolve; });
  } } };
  configureTokenNameplates();
  assert.deepEqual(requested, ['24px "Alice"', "Aa Аа Ёё"]);
  const token = { nameplate: { style: { fontFamily: "Signika" } } };
  hooks.get("drawToken")(token);
  assert.equal(token.nameplate.style.fontFamily, "Signika");
  finishLoading([{}, {}]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(token.nameplate.style.fontFamily, "Alice");

  token.nameplate.style = { fontFamily: "Signika" };
  hooks.get("refreshToken")(token, { refreshNameplate: true });
  assert.equal(token.nameplate.style.fontFamily, "Alice");
  token.nameplate.style = { fontFamily: "Signika" };
  hooks.get("refreshToken")(token, { refreshPosition: true });
  assert.equal(token.nameplate.style.fontFamily, "Signika");
});

test("font completion does not touch a destroyed or replaced nameplate", async () => {
  const hooks = new Map();
  globalThis.Hooks = { on: (event, callback) => hooks.set(event, callback) };
  let finishLoading;
  globalThis.document = { fonts: { load: () => new Promise(resolve => { finishLoading = resolve; }) } };
  configureTokenNameplates();
  const old = { style: { fontFamily: "Signika" } };
  const token = { nameplate: old };
  hooks.get("drawToken")(token);
  token.nameplate = { style: { fontFamily: "Signika" } };
  token.destroyed = true;
  finishLoading([{}]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(old.style.fontFamily, "Signika");
  assert.equal(token.nameplate.style.fontFamily, "Signika");
});
