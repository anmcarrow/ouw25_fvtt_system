import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { defaultTokenName, queueTokenNameSync, stageTokenNameUpdate, syncPendingTokenNames } =
  await import("../dist/ouw25/module/token-names.mjs");

function actor(type, name, shipName) {
  return {
    id: "actor", uuid: "Actor.actor", type, name, system: { shipName }, flags: { ouw25: {} },
    getFlag(scope, key) { return this.flags[scope]?.[key]; },
    async setFlag(scope, key, value) { this.flags[scope][key] = value; return this; },
    async unsetFlag(scope, key) { delete this.flags[scope][key]; return this; }
  };
}

function scene(tokens) {
  return {
    tokens,
    async updateEmbeddedDocuments(type, updates) {
      assert.equal(type, "Token");
      for (const update of updates) this.tokens.find(token => token.id === update._id).name = update.name;
      return updates;
    }
  };
}

test("actor name changes stage the correct prototype name and pending synchronization", () => {
  globalThis.game = { i18n: { localize: () => "HMS" } };
  const merchant = actor("merchant", "Old", "");
  const merchantChange = { name: "New", flags: { ouw25: { other: true } }, prototypeToken: { width: 2 } };
  stageTokenNameUpdate(merchant, merchantChange);
  assert.deepEqual(merchantChange.prototypeToken, { width: 2, name: "New" });
  assert.deepEqual(merchantChange.flags.ouw25, { other: true, tokenNamePending: "New" });
  const cooperative = actor("cooperative", "Company", "Ship");
  const shipChange = { "system.shipName": "" };
  stageTokenNameUpdate(cooperative, shipChange);
  assert.equal(shipChange.prototypeToken.name, "");
  assert.equal(shipChange.flags.ouw25.tokenNamePending, "");
  const companyChange = { name: "New company" };
  stageTokenNameUpdate(cooperative, companyChange);
  assert.deepEqual(companyChange, { name: "New company" });
  const syntheticChange = { name: "Independent" };
  stageTokenNameUpdate({ ...merchant, isToken: true }, syntheticChange);
  assert.deepEqual(syntheticChange, { name: "Independent" });
});

test("ship token names use the editor's localized prefix and quotation marks", async () => {
  const ship = actor("cooperative", "Company", "Bezhetka");
  for (const [language, prefix, shipName, expected] of [
    ["en", "HMS", "Bezhetka", "HMS Bezhetka"],
    ["ru", "СЕВ", "Бежетка", "СЕВ «Бежетка»"]
  ]) {
    const translations = JSON.parse(await readFile(new URL(`../dist/ouw25/lang/${language}.json`, import.meta.url), "utf8"));
    globalThis.game = { i18n: { localize: label => {
      assert.equal(label, "OUW25.Ship.Prefix");
      return translations.OUW25.Ship.Prefix;
    }, format: (label, values) => {
      assert.equal(label, "OUW25.Ship.TokenName");
      assert.equal(values.prefix, prefix);
      return translations.OUW25.Ship.TokenName.replace(/\{(prefix|name)\}/g, (_, field) => values[field]);
    } } };
    ship.system.shipName = shipName;
    assert.equal(defaultTokenName(ship), expected);
    const change = { system: { shipName } };
    stageTokenNameUpdate(ship, change);
    assert.equal(change.prototypeToken.name, expected);
    assert.equal(change.flags.ouw25.tokenNamePending, expected);
  }
  ship.system.shipName = "";
  assert.equal(defaultTokenName(ship), "");
});

test("the GM preserves the editor's prefix when applying an offline rename", async () => {
  const subject = actor("cooperative", "Company", "Bezhetka");
  subject.prototypeToken = { name: "HMS Bezhetka" };
  subject.flags.ouw25.tokenNamePending = "HMS Bezhetka";
  const a = scene([{ id: "one", actorId: subject.id, actorLink: true, name: "Old" }]);
  globalThis.game = { user: { isActiveGM: true }, scenes: [a], i18n: { localize: () => "СЕВ" } };
  await queueTokenNameSync(subject);
  assert.equal(a.tokens[0].name, "HMS Bezhetka");
  assert.equal(subject.getFlag("ouw25", "tokenNamePending"), undefined);
});

test("a ship renamed during flag removal keeps the editor's prefix", async () => {
  const subject = actor("cooperative", "Company", "Old ship");
  subject.prototypeToken = { name: "HMS Old ship" };
  subject.flags.ouw25.tokenNamePending = "HMS Old ship";
  subject.unsetFlag = async function (scope, key) {
    this.unsetFlag = async function (nextScope, nextKey) { delete this.flags[nextScope][nextKey]; return this; };
    this.system.shipName = "New ship";
    this.prototypeToken.name = "HMS New ship";
    delete this.flags[scope][key];
    return this;
  };
  const a = scene([{ id: "one", actorId: subject.id, actorLink: true, name: "Old" }]);
  globalThis.game = { user: { isActiveGM: true }, scenes: [a], i18n: { localize: () => "СЕВ" } };
  await queueTokenNameSync(subject);
  assert.equal(a.tokens[0].name, "HMS New ship");
  assert.equal(subject.getFlag("ouw25", "tokenNamePending"), undefined);
});

test("pending names update only linked tokens across scenes and survive an offline GM", async () => {
  const subject = actor("cooperative", "Company", "Ship");
  subject.system.shipName = "";
  subject.flags.ouw25.tokenNamePending = "";
  const a = scene([
    { id: "one", actorId: subject.id, actorLink: true, name: "Old" },
    { id: "two", actorId: subject.id, actorLink: false, name: "Independent" },
    { id: "three", actorId: "other", actorLink: true, name: "Other" }
  ]);
  const b = scene([{ id: "four", actorId: subject.id, actorLink: true, name: "Old" }]);
  globalThis.game = { user: { isActiveGM: false }, actors: [subject], scenes: [a, b] };
  await queueTokenNameSync(subject);
  assert.equal(subject.getFlag("ouw25", "tokenNamePending"), "");
  assert.equal(a.tokens[0].name, "Old");
  game.user.isActiveGM = true;
  syncPendingTokenNames();
  await queueTokenNameSync(subject);
  assert.deepEqual(a.tokens.map(token => token.name), ["", "Independent", "Other"]);
  assert.equal(b.tokens[0].name, "");
  assert.equal(subject.getFlag("ouw25", "tokenNamePending"), undefined);
});

test("a later rename wins while synchronization is in progress", async () => {
  const subject = actor("merchant", "Old", "");
  subject.name = "First";
  subject.flags.ouw25.tokenNamePending = "First";
  const a = scene([{ id: "one", actorId: subject.id, actorLink: true, name: "Old" }]);
  const update = a.updateEmbeddedDocuments.bind(a);
  let first = true;
  a.updateEmbeddedDocuments = async (...args) => {
    const result = await update(...args);
    if (first) {
      first = false;
      subject.name = "Second";
      subject.flags.ouw25.tokenNamePending = "Second";
    }
    return result;
  };
  globalThis.game = { user: { isActiveGM: true }, scenes: [a] };
  await queueTokenNameSync(subject);
  assert.equal(a.tokens[0].name, "Second");
  assert.equal(subject.getFlag("ouw25", "tokenNamePending"), undefined);
});

test("a scene update failure retains the pending name for a retry", async () => {
  const subject = actor("merchant", "Old", "");
  subject.name = "New";
  subject.flags.ouw25.tokenNamePending = "New";
  const a = scene([{ id: "one", actorId: subject.id, actorLink: true, name: "Old" }]);
  const update = a.updateEmbeddedDocuments;
  a.updateEmbeddedDocuments = async () => { throw new Error("failed"); };
  globalThis.game = { user: { isActiveGM: true }, scenes: [a], i18n: { localize: key => key } };
  const errors = [];
  globalThis.ui = { notifications: { error: error => errors.push(error) } };
  const original = console.error;
  try {
    console.error = () => {};
    await queueTokenNameSync(subject);
  } finally { console.error = original; }
  assert.equal(subject.getFlag("ouw25", "tokenNamePending"), "New");
  assert.equal(errors.length, 1);
  a.updateEmbeddedDocuments = update;
  await queueTokenNameSync(subject);
  assert.equal(a.tokens[0].name, "New");
  assert.equal(subject.getFlag("ouw25", "tokenNamePending"), undefined);
});

test("a rename racing with pending-flag removal is still applied", async () => {
  const subject = actor("merchant", "First", "");
  subject.flags.ouw25.tokenNamePending = "First";
  subject.unsetFlag = async function (scope, key) {
    this.unsetFlag = async function (nextScope, nextKey) { delete this.flags[nextScope][nextKey]; return this; };
    this.name = "Second";
    this.flags[scope][key] = "Second";
    delete this.flags[scope][key];
    return this;
  };
  const a = scene([{ id: "one", actorId: subject.id, actorLink: true, name: "Old" }]);
  globalThis.game = { user: { isActiveGM: true }, scenes: [a] };
  await queueTokenNameSync(subject);
  assert.equal(a.tokens[0].name, "Second");
  assert.equal(subject.getFlag("ouw25", "tokenNamePending"), undefined);
});
