import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderSystemInfo } from "../dist/ouw25/module/settings-sidebar.mjs";

class Element {
  constructor(document, tag) {
    this.ownerDocument = document;
    this.tagName = tag;
    this.children = [];
    this.className = "";
    this.parentNode = null;
  }

  append(...children) {
    for (const child of children) {
      child.remove();
      child.parentNode = this;
      this.children.push(child);
    }
  }

  after(child) {
    child.remove();
    child.parentNode = this.parentNode;
    this.parentNode.children.splice(this.parentNode.children.indexOf(this) + 1, 0, child);
  }

  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }

  querySelector(selector) {
    const name = selector.slice(1);
    for (const child of this.children) {
      if (child.className.split(" ").includes(name)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

function settingsFixture(withUpdate) {
  const document = { createElement: tag => new Element(document, tag) };
  const root = document.createElement("root");
  const info = document.createElement("section");
  info.className = "info";
  const system = document.createElement("div");
  system.className = "system";
  const version = document.createElement("span");
  version.className = "value";
  version.textContent = "0.1.113";
  let pip;
  if (withUpdate) {
    pip = document.createElement("a");
    pip.className = "notification-pip active";
    pip.dataset = { action: "notifyUpdate", update: "system", tooltipText: "Update available" };
    version.append(pip);
  }
  system.append(version);
  info.append(system);
  root.append(info);
  return { root, info, version, pip };
}

test("settings sidebar retains Foundry's update control and links to package resources", async t => {
  const manifest = JSON.parse(await readFile(new URL("../dist/ouw25/system.json", import.meta.url), "utf8"));
  const logo = await readFile(new URL("../dist/ouw25/styles/images/system_logo.webp", import.meta.url));
  assert.equal(logo.toString("ascii", 8, 12), "WEBP");
  globalThis.game = { system: manifest, i18n: { localize: key => key } };
  t.after(() => { delete globalThis.game; });

  for (const withUpdate of [true, false]) {
    const { root, info, version, pip } = settingsFixture(withUpdate);
    renderSystemInfo(root);
    const section = root.querySelector(".ouw25-settings-info");
    assert.ok(section);
    assert.equal(info.querySelector(".system"), null);
    assert.equal(root.children[1], section);
    assert.equal(section.querySelector(".value"), version);
    assert.equal(section.querySelector(".notification-pip"), pip ?? null);
    if (pip) assert.deepEqual(pip.dataset, { action: "notifyUpdate", update: "system", tooltipText: "Update available" });
    const badge = section.querySelector(".ouw25-system-badge");
    assert.equal(badge.children[0].src, "systems/ouw25/styles/images/system_logo.webp");
    assert.equal(badge.children[0].alt, manifest.title);
    const links = section.querySelector(".ouw25-system-links").children.map(item => item.children[0]);
    assert.deepEqual(links.map(link => link.href), [manifest.changelog, manifest.bugs, "https://wiki.ukrytoemore.ru/"]);
    assert.ok(links.every(link => link.target === "_blank" && link.rel === "noopener noreferrer"));
    renderSystemInfo(root);
    assert.equal(root.children.filter(child => child.className === "ouw25-settings-info").length, 1);
  }
  assert.doesNotThrow(() => renderSystemInfo(new Element(null, "root")));
});
