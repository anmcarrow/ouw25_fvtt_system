import assert from "node:assert/strict";
import test from "node:test";
import {
  findEligibleCaptain, hasTraitPair, isPastLocked, reconcileCaptain, resolveCaptain
} from "../dist/ouw25/module/captain.mjs";
import { captainTraitCount } from "../dist/ouw25/module/bargain-dialog.mjs";

function setup(t) {
  const saved = { game: globalThis.game, foundry: globalThis.foundry, fromUuid: globalThis.fromUuid, ui: globalThis.ui };
  t.after(() => Object.assign(globalThis, saved));
  const user = { id: "owner", isGM: false }, gm = { id: "gm", isGM: true };
  const messages = [], actors = new Map();
  globalThis.fromUuid = async uuid => actors.get(uuid) ?? null;
  globalThis.game = {
    user, users: [user, gm], settings: { get: () => "public" },
    i18n: { localize: key => key }
  };
  globalThis.ui = { notifications: { error: message => assert.fail(message) } };
  globalThis.foundry = {
    applications: { handlebars: { renderTemplate: async (_path, data) => JSON.stringify(data) } },
    documents: { ChatMessage: { getSpeaker: () => ({}), applyMode() {}, async create(message) { messages.push(message); } } }
  };
  const merchant = (uuid, past, visible = true) => {
    const actor = {
      uuid, type: "merchant", name: uuid, system: { past, merit: "strong", flaw: "greedy" },
      items: [{ type: "trait", system: { code: "agile" } }],
      testUserPermission: testUser => testUser.isGM || visible
    };
    actors.set(uuid, actor);
    return actor;
  };
  const cooperative = founders => ({
    uuid: "Actor.cooperative", type: "cooperative", name: "Company", system: { founders, captain: null },
    testUserPermission: () => true,
    async update(changes) { this.system.captain = changes["system.captain"]; }
  });
  return { user, gm, messages, merchant, cooperative };
}

test("first eligible founder becomes captain without guessing inaccessible pasts", async t => {
  const { user, merchant, cooperative } = setup(t);
  const slave = merchant("Actor.slave", "slave");
  const first = merchant("Actor.first", "veteran");
  const second = merchant("Actor.second", "artist");
  const coop = cooperative([slave.uuid, first.uuid, second.uuid]);
  assert.equal((await resolveCaptain(coop)).uuid, first.uuid);
  coop.system.captain = second.uuid;
  assert.equal((await resolveCaptain(coop)).uuid, second.uuid);
  coop.system.captain = null;
  first.testUserPermission = target => target.isGM;
  assert.deepEqual(await findEligibleCaptain(coop.system.founders, user), { actor: null, unknown: true });
  coop.system.captain = first.uuid;
  assert.deepEqual(await resolveCaptain(coop), { uuid: first.uuid, actor: null });
  assert.equal(await captainTraitCount(coop), null);
});

test("calculator uses the selected captain's traits rather than the initiating merchant's", async t => {
  const { merchant, cooperative } = setup(t);
  const first = merchant("Actor.first", "veteran");
  const captain = merchant("Actor.captain", "artist");
  first.system.merit = "unset";
  captain.items.push({ type: "trait", system: { code: "cruel" } });
  const coop = cooperative([first.uuid, captain.uuid]);
  coop.system.captain = captain.uuid;
  assert.equal(await captainTraitCount(coop), 4);
  assert.equal(await captainTraitCount(null), null);
});

test("GM reconciles existing founders and replaces a captain who becomes ineligible", async t => {
  const { gm, messages, merchant, cooperative } = setup(t);
  game.user = gm;
  const first = merchant("Actor.first", "veteran"), second = merchant("Actor.second", "artist");
  const coop = cooperative([first.uuid, second.uuid]);
  await reconcileCaptain(coop);
  assert.equal(coop.system.captain, first.uuid);
  assert.equal(messages.length, 0);
  first.system.past = "slave";
  await reconcileCaptain(coop);
  assert.equal(coop.system.captain, second.uuid);
  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(messages[0].content), {
    cooperative: "Company", previous: first.name, next: second.name
  });
  assert.deepEqual(messages[0].whisper.sort(), ["gm", "owner"]);
  second.system.past = "slave";
  await reconcileCaptain(coop);
  assert.equal(coop.system.captain, null);
  assert.equal(messages.length, 2);
});

test("past lock remains in force after traits are removed", () => {
  const actor = { system: { merit: "strong", flaw: "unset", pastLocked: false },
    items: [{ type: "trait", system: { code: "greedy" } }] };
  assert.equal(hasTraitPair(actor), true);
  assert.equal(isPastLocked(actor), true);
  actor.system.pastLocked = true;
  actor.items.length = 0;
  assert.equal(hasTraitPair(actor), false);
  assert.equal(isPastLocked(actor), true);
});

test("reconciliation reports an unavailable previous captain without inventing their identity", async t => {
  const { gm, messages, merchant, cooperative } = setup(t);
  game.user = gm;
  const next = merchant("Actor.next", "artist");
  const coop = cooperative([next.uuid]);
  coop.system.captain = "Actor.deleted";
  await reconcileCaptain(coop);
  assert.equal(coop.system.captain, next.uuid);
  assert.equal(JSON.parse(messages[0].content).previous, "OUW25.Founders.UnknownCaptain");
});

test("reconciliation does not announce a rejected captain update", async t => {
  const { gm, messages, merchant, cooperative } = setup(t);
  game.user = gm;
  const next = merchant("Actor.next", "artist");
  const coop = cooperative([next.uuid]);
  coop.system.captain = "Actor.deleted";
  coop.update = async () => {};
  await assert.rejects(reconcileCaptain(coop), /Captain update failed/);
  assert.equal(messages.length, 0);
});
