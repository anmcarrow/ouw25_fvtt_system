import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dist = new URL("../dist/ouw25/", import.meta.url);

test("the built package registers models and an editable notes sheet for its declared actor types", async () => {
  const manifest = JSON.parse(await readFile(new URL("system.json", dist), "utf8"));
  const types = Object.keys(manifest.documentTypes.Actor);
  const registration = [];
  globalThis.Hooks = { once(event, callback) { if (event === "init") callback(); } };
  globalThis.CONFIG = { Actor: { dataModels: {} } };
  globalThis.foundry = {
    abstract: { TypeDataModel: class {} },
    data: { fields: { StringField: class {} } },
    applications: {
      api: { HandlebarsApplicationMixin: base => base },
      sheets: { ActorSheetV2: class { async _prepareContext() { return {}; } } }
    },
    documents: { collections: { Actors: { registerSheet: (...args) => registration.push(args) } } }
  };

  await import(new URL(manifest.esmodules[0], dist));
  assert.deepEqual(Object.keys(CONFIG.Actor.dataModels), types);
  const [[id, Sheet, options]] = registration;
  assert.equal(id, manifest.id);
  assert.deepEqual(options.types, types);

  const templatePath = Sheet.PARTS.notes.template.replace(`systems/${id}/`, "");
  const template = await readFile(new URL(templatePath, dist), "utf8");
  assert.match(template, /name="system\.notes"/);
  for (const type of types) {
    assert.ok(CONFIG.Actor.dataModels[type].defineSchema().notes);
    const sheet = new Sheet();
    sheet.actor = { type, system: { notes: "test note" } };
    for (const editable of [true, false]) {
      sheet.isEditable = editable;
      assert.deepEqual(await sheet._prepareContext({}), {
        notes: "test note", actorTypeLabel: `TYPES.Actor.${type}`, editable,
        showCollision: editable && type === "merchant"
      });

    }
  }
  await Promise.all([...manifest.styles, ...manifest.languages.map(({ path }) => path)]
    .map(path => readFile(new URL(path, dist))));
});

test("collision distinguishes outcomes after deductions", async () => {
  const { parseCollisionInput, resolveCollision } = await import(new URL("module/collision.mjs", dist));
  assert.deepEqual(parseCollisionInput("4", "0"), { diceCount: 4, deduction: 0 });
  for (const invalid of ["3", "4.5", "101", "4d6"]) assert.throws(() => parseCollisionInput(invalid, "0"), RangeError);
  assert.throws(() => parseCollisionInput("4", "-1"), RangeError);
  const dice = [6, 6, 3, 1];
  for (const [deduction, remaining, outcome] of [[0, 2, "Success"], [1, 1, "Partial"], [3, -1, "Failure"]]) {
    assert.deepEqual(resolveCollision(dice, deduction), { remaining, outcome });
  }
});
