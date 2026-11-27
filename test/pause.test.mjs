import assert from "node:assert/strict";
import test from "node:test";
import { renderBrandedPause } from "../dist/ouw25/module/pause.mjs";

test("pause branding preserves Foundry's overlay and defers to other pause customizations", t => {
  const classes = new Set(["fa-spin", "existing"]);
  const image = { src: "ui/pause.svg", classList: { remove: value => classes.delete(value) } };
  const overlayClasses = new Set(["paused"]);
  const overlay = {
    classList: { add: value => overlayClasses.add(value), remove: value => overlayClasses.delete(value) },
    querySelector: selector => selector === "img" ? image : null
  };
  globalThis.Hooks = { events: { renderGamePause: [{}] } };
  t.after(() => { delete globalThis.Hooks; });

  renderBrandedPause(overlay);
  assert.equal(image.src, "systems/ouw25/styles/images/system_logo.webp");
  assert.deepEqual([...classes], ["existing"]);
  assert.ok(overlayClasses.has("paused"));
  assert.ok(overlayClasses.has("ouw25-pause"));

  image.src = "module/own-pause.svg";
  Hooks.events.renderGamePause.push({});
  renderBrandedPause(overlay);
  assert.equal(image.src, "module/own-pause.svg");
  assert.ok(!overlayClasses.has("ouw25-pause"));

  Hooks.events.renderGamePause.pop();
  assert.doesNotThrow(() => renderBrandedPause({ querySelector: () => null }));
});
