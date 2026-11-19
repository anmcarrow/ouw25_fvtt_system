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
    data: { fields: { StringField: class {}, NumberField: class {}, BooleanField: class {} } },
    applications: {
      api: { HandlebarsApplicationMixin: base => base },
      sheets: { ActorSheetV2: class {
        async _prepareContext() { return {}; }
        async _processSubmitData(_event, _form, data) { return data; }
      } }
    },
    documents: { collections: { Actors: { registerSheet: (...args) => registration.push(args) } } }
  };

  await import(new URL(manifest.esmodules[0], dist));
  const { MERCHANT_PASTS, MERCHANT_SPECIALTIES } = await import(new URL("module/merchant.mjs", dist));
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
    const merchant = type === "merchant";
    sheet.actor = { type, system: { notes: "test note", pocketMoney: 12, budget: 34, pensionBalance: 30_005,
      luck: 0, specialty: "medic", past: "unset", fragile: false, wound1: true, wound2: false, wound3: false, wound4: true } };
    for (const editable of [true, false]) {
      sheet.isEditable = editable;
      assert.deepEqual(await sheet._prepareContext({}), {
        notes: "test note", actorTypeLabel: `TYPES.Actor.${type}`, editable,
        showCollision: editable && merchant,
        money: merchant ? { value: 12, field: "pocketMoney", label: "OUW25.Finance.PocketMoney" }
          : { value: 34, field: "budget", label: "OUW25.Finance.Budget" },
        pension: merchant ? { balance: 30_005, leaves: 1, untilNext: 29_995, complete: false } : null,
        condition: merchant ? { specialties: MERCHANT_SPECIALTIES.map(value => ({
          value, label: `OUW25.Specialty.${value}`, selected: value === "medic"
        })), specialtyHelp: "OUW25.Specialty.Help.medic", specialtyConflict: false,
        specialtyRestriction: null, specialtyFormula: "1d4", pasts: MERCHANT_PASTS.map(value => ({
          value, label: `OUW25.Past.${value}`, selected: value === "unset"
        })), showFragile: false, fragile: false, luck: 0, canSpend: false, canAdd: true, wounds: [
          { slot: 1, marked: true, lethal: false }, { slot: 2, marked: false, lethal: false },
          { slot: 3, marked: false, lethal: true }
        ] } : null
      });

    }
    let updates = 0;
    sheet.actor.update = async data => {
      updates++;
      sheet.actor.system.luck = data["system.luck"];
    };
    const changeLuck = direction => Sheet.DEFAULT_OPTIONS.actions.changeLuck.call(sheet, null, { dataset: { luck: direction } });
    await changeLuck("add");
    assert.equal(updates, 0);
    sheet.isEditable = true;
    await changeLuck("spend");
    assert.equal(updates, 0);
    await changeLuck("add");
    if (merchant) {
      assert.equal(sheet.actor.system.luck, 1);
      await changeLuck("spend");
      assert.equal(sheet.actor.system.luck, 0);
      assert.equal(updates, 2);
      const warnings = [];
      globalThis.ui = { notifications: { warn: message => warnings.push(message) } };
      globalThis.game = { i18n: { localize: key => key } };
      const submit = system => sheet._processSubmitData(null, null, { system });
      assert.deepEqual(await submit({ past: "savage", specialty: "navigator" }), {});
      assert.equal(warnings.pop(), "OUW25.Specialty.Restriction.savage");
      assert.deepEqual(await submit({ past: "hard_worker", specialty: "navigator" }), {
        system: { past: "hard_worker", specialty: "navigator" }
      });
      assert.deepEqual(await submit({ past: "hard_worker", specialty: "medic" }), {
        system: { past: "hard_worker", specialty: "medic" }
      });
      for (const [past, fragile, threshold] of [
        ["hard_worker", false, 4], ["artist", false, 2], ["deprived", false, 3],
        ["deprived", true, 2], ["veteran", true, 3], ["hard_worker", true, 4]
      ]) {
        Object.assign(sheet.actor.system, { past, fragile });
        const { condition } = await sheet._prepareContext({});
        assert.equal(condition.showFragile, past === "deprived");
        assert.equal(condition.wounds.length, threshold);
        assert.deepEqual(condition.wounds.filter(wound => wound.lethal).map(wound => wound.slot), [threshold]);
        if (threshold === 4) assert.equal(condition.wounds[3].marked, true);
      }
    } else assert.equal(updates, 0);
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

test("creation rolls map to the pilot background table and apply starting-money exceptions", async () => {
  const { pastFromRoll, specialtyFromRoll, startingPocketMoney } = await import(new URL("module/merchant.mjs", dist));
  assert.deepEqual([1, 2, 3, 4].map(specialtyFromRoll), ["quartermaster", "navigator", "medic", "mechanic"]);
  assert.throws(() => specialtyFromRoll(0), RangeError);
  assert.throws(() => specialtyFromRoll(5), RangeError);
  assert.deepEqual([1, 2].map(total => specialtyFromRoll(total, "hard_worker")), ["navigator", "mechanic"]);
  assert.throws(() => specialtyFromRoll(3, "hard_worker"), RangeError);
  assert.equal(specialtyFromRoll(1, "savage"), "medic");
  assert.equal(pastFromRoll(3), "veteran");
  assert.equal(pastFromRoll(6), "deprived");
  assert.equal(pastFromRoll(18), "slave");
  assert.throws(() => pastFromRoll(2), RangeError);
  assert.throws(() => pastFromRoll(19), RangeError);
  assert.equal(startingPocketMoney(14, "veteran"), 140);
  assert.equal(startingPocketMoney(14, "deprived"), 700);
  assert.equal(startingPocketMoney(14, "slave"), 0);
});

test("pension deposits advance leave thresholds without rounding or overflowing", async () => {
  const { pensionBalanceAfterDeposit, pensionProgress } = await import(new URL("module/finance.mjs", dist));
  assert.deepEqual(pensionProgress(29_999), { leaves: 0, untilNext: 1 });
  const balance = pensionBalanceAfterDeposit(29_999, "1");
  assert.deepEqual(pensionProgress(balance), { leaves: 1, untilNext: 30_000 });
  assert.deepEqual(pensionProgress(240_000), { leaves: 8, untilNext: null });
  assert.deepEqual(pensionProgress(270_000), { leaves: 8, untilNext: null });
  for (const invalid of ["", "0", "-1", "1.5", "1e2", "9007199254740992"]) {
    assert.throws(() => pensionBalanceAfterDeposit(0, invalid), RangeError);
  }
  assert.throws(() => pensionBalanceAfterDeposit(Number.MAX_SAFE_INTEGER, "1"), RangeError);
});

test("the English fallback covers the Russian sheet labels and roll result placeholders", async () => {
  const manifest = JSON.parse(await readFile(new URL("system.json", dist), "utf8"));
  const readLocale = async lang => {
    const entry = manifest.languages.find(language => language.lang === lang);
    assert.ok(entry, `Missing ${lang} in the manifest`);
    return JSON.parse(await readFile(new URL(entry.path, dist), "utf8"));
  };
  const [english, russian] = await Promise.all(["en", "ru"].map(readLocale));
  const signature = object => Object.fromEntries(Object.entries(object).map(([key, value]) => [
    key, typeof value === "string" ? (value.match(/\{\w+\}/g) ?? []).sort() : signature(value)
  ]));
  assert.deepEqual(signature(english), signature(russian));
});
