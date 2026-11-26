import assert from "node:assert/strict";
import test from "node:test";
import { installTooltipDelay } from "../dist/ouw25/module/tooltip-delay.mjs";

function harness() {
  let time = 0, nextId = 0;
  const timers = new Map(), events = [];
  const document = () => {
    const listeners = new Map();
    return {
      addEventListener(type, callback) { listeners.set(type, callback); },
      dispatch(type, target) { listeners.get(type)?.({ target }); }
    };
  };
  const root = document();
  const manager = {
    element: null,
    activate(element, options) { this.element = element; events.push(["activate", element.name, options]); },
    deactivate() { events.push(["deactivate"]); this.element = null; },
    activateListeners(doc) { events.push(["listeners", doc]); }
  };
  const options = {
    now: () => time,
    schedule(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, at: time + delay });
      return id;
    },
    cancel(id) { timers.delete(id); }
  };
  const advance = ms => {
    const end = time + ms;
    while (true) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      time = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    time = end;
  };
  const element = (name, system = true) => ({
    name, isConnected: true, matches: () => true, closest: () => system ? {} : null
  });
  installTooltipDelay(manager, root, options);
  return { root, manager, events, advance, element, document, options };
}

test("system tooltips wait one second even when switching from an active tooltip", () => {
  const h = harness();
  const first = h.element("first"), second = h.element("second");
  h.root.dispatch("pointerenter", first);
  h.advance(500);
  h.manager.activate(first, { direction: "UP" });
  h.advance(499);
  assert.equal(h.manager.element, null);
  h.advance(1);
  assert.equal(h.manager.element, first);
  assert.deepEqual(h.events[0], ["activate", "first", { direction: "UP" }]);

  h.root.dispatch("pointerleave", first);
  h.root.dispatch("pointerenter", second);
  h.manager.activate(second);
  assert.equal(h.manager.element, null);
  h.advance(999);
  assert.equal(h.manager.element, null);
  h.advance(1);
  assert.equal(h.manager.element, second);
});

test("leaving or removing a control cancels its pending tooltip", () => {
  const h = harness();
  const first = h.element("first");
  h.root.dispatch("pointerenter", first);
  h.advance(500);
  h.manager.activate(first);
  h.root.dispatch("pointerleave", first);
  h.advance(1000);
  assert.equal(h.manager.element, null);
  h.root.dispatch("pointerenter", first);
  h.manager.activate(first);
  first.isConnected = false;
  h.advance(1000);
  assert.equal(h.manager.element, null);
});

test("other Foundry tooltips retain their behavior and detached documents are supported", () => {
  const h = harness();
  const external = h.element("external", false);
  h.root.dispatch("pointerenter", external);
  h.manager.activate(external);
  assert.equal(h.manager.element, external);
  const detached = h.document(), system = h.element("detached");
  h.manager.activateListeners(detached);
  detached.dispatch("pointerenter", system);
  h.manager.activate(system);
  h.advance(999);
  assert.equal(h.manager.element, null);
  h.advance(1);
  assert.equal(h.manager.element, system);
  installTooltipDelay(h.manager, h.root, h.options);
  assert.equal(h.manager.element, system);
});
