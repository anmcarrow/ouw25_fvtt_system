import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dist = new URL("../dist/ouw25/", import.meta.url);

test("the built package registers models and an editable notes sheet for its declared actor types", async () => {
  const manifest = JSON.parse(await readFile(new URL("system.json", dist), "utf8"));
  const types = Object.keys(manifest.documentTypes.Actor);
  const registration = [];
  globalThis.Hooks = { once(event, callback) { if (event === "init") callback(); } };
  globalThis.CONFIG = { Actor: { dataModels: {} }, Item: { dataModels: {} } };
  globalThis.foundry = {
    abstract: { TypeDataModel: class { static migrateData(source) { return source; } } },
    data: { fields: { StringField: class {}, NumberField: class {}, BooleanField: class {} } },
    applications: {
      api: { HandlebarsApplicationMixin: base => base },
      ux: { FormDataExtended: class {} },
      sheets: { ActorSheetV2: class {
        get element() { return this._element; }
        get form() { return this._form; }
        async _prepareContext() { return {}; }
        _onChangeForm() {}
        async _onClickAction() { this.actionInvoked = true; }
        async _processSubmitData(_event, _form, data) { return data; }
      } }
    },
    documents: { collections: { Actors: { registerSheet: (...args) => registration.push(args) } } }
  };
  globalThis.game = { i18n: { localize: key => key } };

  await import(new URL(manifest.esmodules[0], dist));
  const { MERCHANT_PASTS, MERCHANT_SPECIALTIES } = await import(new URL("module/merchant.mjs", dist));
  assert.deepEqual(Object.keys(CONFIG.Actor.dataModels), types);
  assert.deepEqual(Object.keys(CONFIG.Item.dataModels), Object.keys(manifest.documentTypes.Item));
  const [[id, Sheet, options]] = registration;
  assert.equal(id, manifest.id);
  assert.deepEqual(options.types, types);

  const templatePath = Sheet.PARTS.notes.template.replace(`systems/${id}/`, "");
  const template = await readFile(new URL(templatePath, dist), "utf8");
  assert.match(template, /name="system\.notes"/);
  assert.match(template, /type="submit"/);
  assert.match(template, /data-autosave-status/);
  assert.match(template, /<output\b[^>]*ouw25-hold-status[^>]*>[^<]*occupied=ship\.hold\.occupied capacity=ship\.hold\.capacity/);
  for (const type of types) {
    assert.ok(CONFIG.Actor.dataModels[type].defineSchema().notes);
    const sheet = new Sheet();
    const merchant = type === "merchant";
    sheet.actor = { type, name: "Original", system: { notes: "test note", pocketMoney: 12, budget: 34, pensionBalance: 30_005,
      dream: "Custom dream", hiring: "checkers",
      luck: 0, specialty: "medic", past: "unset", merit: "strong", flaw: "unset",
      fragile: false, wound1: true, wound2: false, wound3: false, wound4: true } };
    if (!merchant) Object.assign(sheet.actor.system, {
      shipClass: 0, cargoLoad: 5, fuelStock: 10.5, provisionsStock: 18.25, mount1: "none", mount2: "none",
      compartment1: "passenger", compartment2: "none", compartment3: "none", compartment4: "none",
      gear1: "sandshoes"
    });
    sheet.actor.items = [{ type: "debt", id: "debt-1", name: "Creditor", system: {
      direction: "payable", amount: 12, location: "Port"
    } }, { type: "relationship", id: "friend-1", name: "Friend", system: {
      direction: "friend", location: "Harbor", reason: "Rescue"
    } }, { type: "possession", id: "gear-1", name: "Lantern", system: { amount: 0 } },
    { type: "trait", id: "trait-1", system: { code: "greedy" } },
    { type: "contact", id: "contact-1", name: "Dockmaster", system: {
      location: "", reason: "Ally", amount: Number.MAX_SAFE_INTEGER
    } },
    { type: "contact", id: "contact-2", name: "Broker", system: {
      location: "Harbor", reason: "", amount: 2
    } },
    { type: "contract", id: "contract-1", name: "Deliver supplies", system: {
      location: "Harbor", deadline: "Before the next tide", amount: 45
    } },
    { type: "cargo", id: "cargo-1", name: "Crates", system: { quantity: 3, volume: 12.5 } },
    { type: "cargo", id: "cargo-2", name: "Bales", system: { quantity: 5, volume: 2.25 } }];
    for (const editable of [true, false]) {
      sheet.isEditable = editable;
      const { ship, traits, identity, pastMoves, contacts, contracts, showContracts, cargo, ...context } = await sheet._prepareContext({});
      assert.equal(showContracts, !merchant);
      assert.equal(pastMoves, null);
      if (merchant) {
        assert.equal(cargo, null);
        assert.equal(contracts, null);
        assert.equal(contacts, null);
        assert.equal(ship, null);
        assert.equal(identity.name, "Original");
        assert.equal(identity.dream, "Custom dream");
        assert.equal(identity.hiring.find(choice => choice.selected).value, "checkers");
        assert.equal(identity.hiringHelp, "OUW25.Identity.HiringHelp.checkers");
        const [merit, flaw] = traits;
        assert.equal(merit.choices.find(choice => choice.selected).value, "strong");
        assert.equal(merit.help, "OUW25.Trait.Help.strong");
        assert.deepEqual(merit.entries, []);
        assert.deepEqual(flaw.entries, [{
          id: "trait-1", name: "OUW25.Trait.Names.greedy", help: "OUW25.Trait.Help.greedy"
        }]);
      } else {
        assert.equal(cargo.volume, 14.75);
        assert.deepEqual(cargo.entries[0], { id: "cargo-1", name: "Crates", quantity: 3, volume: 12.5 });
        assert.deepEqual(contracts, [{
          id: "contract-1", name: "Deliver supplies", location: "Harbor", deadline: "Before the next tide", amount: 45
        }]);
        assert.equal(contacts.total, "9007199254740993");
        assert.deepEqual(contacts.entries.map(({ id }) => id), ["contact-1", "contact-2"]);
        assert.equal(contacts.entries[0].reason, "Ally");
        assert.equal(traits, null);
        assert.equal(identity, null);
        assert.equal(ship.freeMounts, 2);
        assert.equal(ship.compartmentSpace, 420);
        assert.deepEqual(ship.hold, { occupied: 452.25, capacity: 1600, nearFull: false, overloaded: false });
        assert.deepEqual(ship.hold, { capacity: 1600, occupied: 452.25, nearFull: false, overloaded: false });
        assert.equal(ship.mounts[0].choices.find(choice => choice.selected).value, "none");
        assert.equal(ship.gear[0].choices.find(choice => choice.value === "sandshoes").disabled, false);
        assert.deepEqual(ship.gear[1].choices.filter(choice => choice.disabled).map(choice => choice.value), ["sandshoes"]);
      }
      assert.deepEqual(context, {
        notes: "test note", autosaveStatus: "OUW25.SaveStatus.Saved", autosaveStatusState: "saved",
        actorTypeLabel: `TYPES.Actor.${type}`, editable,
        showCollision: editable && merchant,
        money: merchant ? { value: 12, field: "pocketMoney", label: "OUW25.Finance.PocketMoney" }
          : { value: 34, field: "budget", label: "OUW25.Finance.Budget" },
        pension: merchant ? { balance: 30_005, leaves: 1, untilNext: 29_995, complete: false } : null,
        ledger: merchant ? { totals: { payable: "12", receivable: "0" }, groups: [
          { label: "OUW25.Debt.payable", entries: [{ id: "debt-1", name: "Creditor", amount: 12, location: "Port" }] },
          { label: "OUW25.Debt.receivable", entries: [] }
        ] } : null,
        relationships: merchant ? [
          { label: "OUW25.Relationship.friend", entries: [{ id: "friend-1", name: "Friend", location: "Harbor", reason: "Rescue" }] },
          { label: "OUW25.Relationship.enemy", entries: [] }
        ] : null,
        possessions: merchant ? { entries: [{ id: "gear-1", name: "Lantern", amount: 0 }] } : null,
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
        const { condition, pastMoves } = await sheet._prepareContext({});
        assert.equal(pastMoves.help, `OUW25.PersonalAction.PastHelp.${past}`);
        if (past === "veteran") assert.equal(pastMoves.actions[0].id, "comrade");
        assert.equal(condition.showFragile, past === "deprived");
        assert.equal(condition.wounds.length, threshold);
        assert.deepEqual(condition.wounds.filter(wound => wound.lethal).map(wound => wound.slot), [threshold]);
        if (threshold === 4) assert.equal(condition.wounds[3].marked, true);
      }
    } else assert.equal(updates, 0);
  }

  const autosaveStatus = { textContent: "", dataset: {} };
  const sheet = new Sheet();
  sheet._element = {
    querySelector: selector => selector === "[data-autosave-status]" ? autosaveStatus : null
  };
  sheet._form = { contains: () => true };
  sheet.isEditable = true;
  sheet.actor = {
    type: "cooperative",
    name: "Original ship",
    system: Object.assign(Object.create({ unrest: 3 }), { notes: "", forcedMode: false }),
    items: [],
    update: async data => {
      sheet.updates.push(data);
      for (const [path, value] of Object.entries(data)) {
        if (path === "name") sheet.actor.name = value;
        else sheet.actor.system[path.slice("system.".length)] = value;
      }
    }
  };
  sheet.updates = [];
  const change = event => sheet._onChangeForm({}, event);
  const submit = () => sheet._onSubmitForm({ handler: async function (_event, form) {
    assert.equal(form, sheet._form);
    this.submitted = true;
  } }, { currentTarget: sheet._form, preventDefault() {} });
  await change({ target: {
    name: "system.unrest", type: "number", value: "4", disabled: false, readOnly: false,
    dataset: {}, checkValidity: () => true
  } });
  assert.deepEqual(sheet.updates, [{ "system.unrest": 4 }]);
  assert.equal(autosaveStatus.textContent, "OUW25.SaveStatus.Saved");
  await change({ target: {
    name: "system.forcedMode", type: "checkbox", checked: true, disabled: false, readOnly: false,
    dataset: {}, checkValidity: () => true
  } });
  assert.deepEqual(sheet.updates[1], { "system.forcedMode": true });
  await change({ target: {
    name: "name", type: "text", value: "New ship", disabled: false, readOnly: false,
    dataset: {}, checkValidity: () => true
  } });
  assert.deepEqual(sheet.updates[2], { name: "New ship" });
  await change({ target: {
    name: "system.notes", type: "textarea", value: "Updated notes", disabled: false, readOnly: false,
    dataset: {}, checkValidity: () => true
  } });
  assert.deepEqual(sheet.updates[3], { "system.notes": "Updated notes" });
  await change({ target: { dataset: { deposit: "" }, value: "100" } });
  assert.equal(sheet.updates.length, 4);

  let releaseUpdate;
  sheet.actor.update = async data => {
    await new Promise(resolve => { releaseUpdate = resolve; });
    sheet.updates.push(data);
    sheet.actor.system.unrest = data["system.unrest"];
  };
  const pendingChange = change({ target: {
    name: "system.unrest", type: "number", value: "5", disabled: false, readOnly: false,
    dataset: {}, checkValidity: () => true
  } });
  await Promise.resolve();
  const pendingAction = sheet._onClickAction({}, {});
  await Promise.resolve();
  assert.equal(sheet.actionInvoked, undefined);
  releaseUpdate();
  await Promise.all([pendingChange, pendingAction]);
  assert.equal(sheet.actionInvoked, true);

  let validityReported = false;
  await change({ target: {
    name: "system.unrest", type: "number", value: "", disabled: false, readOnly: false,
    dataset: {}, checkValidity: () => false, reportValidity: () => { validityReported = true; }
  } });
  assert.equal(validityReported, true);
  assert.equal(autosaveStatus.textContent, "OUW25.SaveStatus.Invalid");
  await submit();
  assert.equal(sheet.submitted, true);
  assert.equal(autosaveStatus.textContent, "OUW25.SaveStatus.Saved");

  const saveErrors = [];
  globalThis.ui = { notifications: { warn() {}, error: message => saveErrors.push(message) } };
  const originalConsoleError = console.error;
  console.error = () => {};
  sheet.actor.update = async () => { throw new Error("storage unavailable"); };
  try {
    await change({ target: {
      name: "system.unrest", type: "number", value: "6", disabled: false, readOnly: false,
      dataset: {}, checkValidity: () => true
    } });
    assert.equal(autosaveStatus.textContent, "OUW25.SaveStatus.Error");
    assert.deepEqual(saveErrors, ["OUW25.SaveStatus.Error"]);
    sheet.actionInvoked = false;
    await sheet._onClickAction({}, {});
    assert.equal(sheet.actionInvoked, false);
  } finally {
    console.error = originalConsoleError;
  }
  await submit();
  assert.equal(autosaveStatus.textContent, "OUW25.SaveStatus.Saved");

  const specialtyWarnings = [];
  globalThis.ui = { notifications: { warn: message => specialtyWarnings.push(message), error() {} } };
  const merchantSheet = new Sheet();
  merchantSheet._element = sheet._element;
  merchantSheet._form = sheet._form;
  merchantSheet.isEditable = true;
  merchantSheet.actor = {
    type: "merchant", name: "Merchant", system: { past: "savage", specialty: "medic" },
    update: async () => assert.fail("an invalid specialty must not be autosaved")
  };
  await merchantSheet._onChangeForm({}, { target: {
    name: "system.specialty", type: "select-one", value: "navigator", disabled: false, readOnly: false,
    dataset: {}, checkValidity: () => true
  } });
  assert.deepEqual(specialtyWarnings, ["OUW25.Specialty.Restriction.savage"]);
  assert.equal(autosaveStatus.textContent, "OUW25.SaveStatus.Invalid");

  const cooperative = CONFIG.Actor.dataModels.cooperative;
  assert.deepEqual(cooperative.migrateData({ unrest: 11.5 }), { unrest: 11, illuminationUnrestPending: true });

  await Promise.all([...manifest.styles, ...manifest.languages.map(({ path }) => path)]
    .map(path => readFile(new URL(path, dist))));
});

test("identity rolls use independent name indices and preserve the Roll20 table boundaries", async () => {
  const { dreamFromRoll, hiringFromRoll, merchantNameFromRolls } = await import(new URL("module/merchant.mjs", dist));
  assert.equal(merchantNameFromRolls(1, 15), "Абгейл Бррлин");
  assert.equal(merchantNameFromRolls(15, 1), "Афн Глоф");
  assert.throws(() => merchantNameFromRolls(1, 16), RangeError);
  assert.throws(() => dreamFromRoll(11), RangeError);
  assert.equal(hiringFromRoll(1), "dance");
  assert.equal(hiringFromRoll(11), "charming");
  assert.throws(() => hiringFromRoll(0), RangeError);
});

test("trait rolls follow the Roll20 ranges and have localized names and help", async () => {
  const { MERCHANT_TRAITS, traitFromRoll } = await import(new URL("module/traits.mjs", dist));
  assert.equal(traitFromRoll("merit", 3), "stress_resistant");
  assert.equal(traitFromRoll("merit", 18), "empathetic");
  assert.equal(traitFromRoll("flaw", 10), "distracted");
  assert.equal(traitFromRoll("flaw", 18), "notoriety");
  for (const [kind, total] of [["merit", 2], ["flaw", 19], ["flaw", 6.5], ["toString", 10]]) {
    assert.throws(() => traitFromRoll(kind, total), RangeError);
  }
  for (const lang of ["ru", "en"]) {
    const { OUW25: { Trait } } = JSON.parse(await readFile(new URL(`lang/${lang}.json`, dist)));
    for (const code of Object.values(MERCHANT_TRAITS).flat()) {
      assert.ok(Trait.Names[code], `${lang}: missing name for ${code}`);
      assert.ok(Trait.Help[code], `${lang}: missing help for ${code}`);
    }
  }
});

test("personal moves resolve situational rolls without applying consequences", async () => {
  const { personalActions, personalOutcome, provisionFormula } = await import(new URL("module/personal-actions.mjs", dist));
  const [, , debtor] = personalActions("past", "gambler");
  assert.deepEqual(personalOutcome(debtor, 4), {
    key: "OUW25.PersonalAction.Moves.debtor.4", extra: { amount: "1d6*1000", guards: "2d6" }
  });
  assert.deepEqual(personalOutcome(debtor, 6), { key: "OUW25.PersonalAction.Moves.debtor.6", extra: {} });
  const [poison] = personalActions("hiring", "ate");
  assert.match(personalOutcome(poison, 3).key, /\.yes$/);
  assert.match(personalOutcome(poison, 4).key, /\.no$/);
  assert.throws(() => personalOutcome(poison, 7), RangeError);
  assert.equal(provisionFormula("3"), "6d6");
  assert.throws(() => provisionFormula("2.5"), RangeError);
  assert.deepEqual(personalActions("past", "constructor"), []);
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

test("ship class hides slots without counting or erasing their loadout", async () => {
  const { shipConfiguration } = await import(new URL("module/ship.mjs", dist));
  const fields = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
    [`mount${index + 1}`, "none"], [`compartment${index + 1}`, "none"]
  ]).flat());
  const ship = { ...fields, shipClass: 6, mount1: "none", mount8: "winch", compartment4: "passenger", compartment8: "diving" };
  const large = shipConfiguration(ship);
  assert.equal(large.freeMounts, 7);
  assert.equal(large.compartmentSpace, 1220);
  const small = shipConfiguration({ ...ship, shipClass: 0 });
  assert.equal(small.freeMounts, 2);
  assert.equal(small.compartmentSpace, 420);
  assert.equal(small.compartments.length, 4);
  assert.equal(ship.mount8, "winch");
  assert.equal(ship.compartment8, "diving");
});

test("hold warns at 100 st. free and distinguishes overload from exact capacity", async () => {
  const { shipHold } = await import(new URL("module/ship.mjs", dist));
  const ship = { shipClass: 0, cargoLoad: 1498, fuelStock: 0, provisionsStock: 18 };
  assert.equal(shipHold(ship, 0, 0).nearFull, false);
  assert.equal(shipHold(ship, 1, 0).nearFull, true);
  assert.equal(shipHold(ship, 101, 0).overloaded, false);
  assert.equal(shipHold(ship, 101.5, 0).overloaded, true);
  assert.equal(shipHold({ ...ship, shipClass: 4 }, 0, 0).capacity, 25200);
});

test("a spacious hold applies the saved bonus once and only while selected", async () => {
  const { shipHold } = await import(new URL("module/ship.mjs", dist));
  const ship = { shipClass: 0, cargoLoad: 1601, fuelStock: 0, provisionsStock: 0, holdBonus: 200 };
  assert.equal(shipHold(ship, 0, 0).overloaded, true);
  const expanded = { ...ship, merit2: "large_hold", merit4: "large_hold" };
  assert.deepEqual(shipHold(expanded, 0, 0), { capacity: 1800, occupied: 1601, nearFull: false, overloaded: false });
  assert.equal(shipHold({ ...expanded, holdBonus: 150 }, 0, 0).capacity, 1600);
});

test("ship layout rejects duplicate qualities and new compartments that do not fit", async () => {
  const { shipSelectionError } = await import(new URL("module/ship.mjs", dist));
  const ship = { shipClass: 0, compartment1: "diving", merit1: "strong_hull", flaw1: "cursed", fuelStock: 10 };
  assert.equal(shipSelectionError(ship, { compartment2: "diving" }, 0), "OUW25.Ship.CompartmentDoesNotFit");
  assert.equal(shipSelectionError(ship, { compartment2: "passenger" }, 370), undefined);
  assert.equal(shipSelectionError(ship, { compartment2: "passenger" }, 371), "OUW25.Ship.CompartmentDoesNotFit");
  assert.equal(shipSelectionError({ ...ship, compartment2: "diving" }, { compartment2: "none" }, 1000), undefined);
  assert.equal(shipSelectionError(ship, { merit2: "strong_hull" }, 0), "OUW25.ShipQuality.Duplicates");
  assert.equal(shipSelectionError(ship, { flaw2: "cursed" }, 0), "OUW25.ShipQuality.Duplicates");
  assert.equal(shipSelectionError(ship, { merit1: "none", merit2: "strong_hull" }, 0), undefined);
});

test("fixed equipment can only be installed once, but may be moved or removed", async () => {
  const { shipSelectionError } = await import(new URL("module/ship.mjs", dist));
  const ship = { shipClass: 0, gear1: "sandshoes", gear2: "none" };
  assert.equal(shipSelectionError(ship, { gear2: "sandshoes" }, 0), "OUW25.ShipGear.Duplicates");
  assert.equal(shipSelectionError(ship, { gear1: "tow", gear2: "tow" }, 0), "OUW25.ShipGear.Duplicates");
  assert.equal(shipSelectionError(ship, { gear2: "tow" }, 0), undefined);
  assert.equal(shipSelectionError(ship, { gear1: "none", gear2: "sandshoes" }, 0), undefined);
  assert.equal(shipSelectionError({ ...ship, gear2: "sandshoes" }, { gear1: "none" }, 0), undefined);
});

test("a reinforced hull adds two durability once; marked damage stays repairable after removing it", async () => {
  const { shipCondition } = await import(new URL("module/ship.mjs", dist));
  const ship = { shipClass: 0, damage1: true, damage2: true, damage3: true, damage5: true };
  const reinforced = shipCondition({ ...ship, merit1: "strong_hull", merit2: "strong_hull" });
  assert.equal(reinforced.durability, 5);
  assert.equal(reinforced.overLimit, false);
  assert.deepEqual(reinforced.slots.map(({ number }) => number), [1, 2, 3, 4, 5]);
  const bare = shipCondition(ship);
  assert.equal(bare.damaged, 4);
  assert.equal(bare.overLimit, true);
  assert.deepEqual(bare.slots.at(-1), { number: 5, marked: true, beyondLimit: true });
  assert.equal(bare.slots.length, 4);
  assert.equal(shipCondition({ shipClass: 0, damage3: true }).overLimit, false);
  assert.equal(shipCondition({ shipClass: 6, merit4: "strong_hull" }).slots.at(-1).number, 11);
});

test("the mechanic's check toggles forced mode and only full failures mark damage", async () => {
  const { resolveForcedMode, SHIP_DAMAGE_SLOTS } = await import(new URL("module/ship.mjs", dist));
  const ship = { forcedMode: false, damage1: true, damage3: true };
  assert.deepEqual(resolveForcedMode(ship, 1), { forcedMode: true, damageSlot: undefined });
  assert.deepEqual(resolveForcedMode(ship, 0), { forcedMode: false, damageSlot: 2 });
  assert.deepEqual(resolveForcedMode({ ...ship, forcedMode: true }, -1), { forcedMode: false, damageSlot: 2 });
  assert.deepEqual(resolveForcedMode({ ...ship, forcedMode: true }, 2), { forcedMode: false, damageSlot: undefined });
  const full = Object.fromEntries(SHIP_DAMAGE_SLOTS.map(slot => [`damage${slot}`, true]));
  assert.deepEqual(resolveForcedMode({ ...ship, ...full }, 0), { forcedMode: false, damageSlot: undefined });
  assert.throws(() => resolveForcedMode({ ...ship, flaw2: "worn_engine" }, 2), /ForcedBlocked/);
  assert.equal(resolveForcedMode({ ...ship, flaw2: "worn_engine", forcedMode: true }, 2).forcedMode, false);
});

test("voyage rates follow crew bands, modes, shortages, and ship flaws", async () => {
  const { calculateVoyage } = await import(new URL("module/ship.mjs", dist));
  const ship = { shipClass: 0, crewCount: 10, fuelStock: 10, provisionsStock: 10, unrest: 0 };
  assert.deepEqual(
    (({ crewBand, speed, fuelPerSector, provisionsPerSector, unrestPerSector, travelBlocked }) =>
      ({ crewBand, speed, fuelPerSector, provisionsPerSector, unrestPerSector, travelBlocked }))(calculateVoyage(ship)),
    { crewBand: "above-half", speed: 1, fuelPerSector: 1, provisionsPerSector: 1, unrestPerSector: 1, travelBlocked: false }
  );
  const forced = calculateVoyage({ ...ship, forcedMode: true, illuminationMode: true });
  assert.equal(forced.speed, 2);
  assert.equal(forced.fuelPerSector, 4);
  assert.equal(forced.provisionsPerSector, 0.5);
  assert.equal(forced.unrestPerSector, 0);
  assert.equal(calculateVoyage({ ...ship, crewCount: 5, forcedMode: true }).crewBand, "half");
  const lowCrew = calculateVoyage({ ...ship, crewCount: 4, forcedMode: true });
  assert.equal(lowCrew.speed, 1);
  assert.equal(lowCrew.fuelPerSector, 4);
  assert.equal(lowCrew.provisionsPerSector, 0.5);
  const worn = calculateVoyage({ ...ship, forcedMode: true, flaw3: "worn_engine" });
  assert.equal(worn.forced, false);
  assert.equal(worn.forcedBlocked, true);
  assert.equal(worn.fuelPerSector, 1);
  const blocked = calculateVoyage({
    ...ship, crewCount: 0, fuelStock: 0, provisionsStock: 0, flaw1: "cursed"
  });
  assert.equal(blocked.travelBlocked, true);
  assert.deepEqual(blocked.shortages, ["OUW25.Voyage.NoCrew", "OUW25.Voyage.FuelShortage", "OUW25.Voyage.NoProvisions"]);
  assert.equal(blocked.unrest, 5);
  assert.equal(calculateVoyage({ ...ship, crewCount: 11 }).crewOverCapacity, true);
});

test("sector transition applies and exactly rolls back the complete recorded state", async () => {
  const { prepareSectorTransition, rollbackSectorTransition } = await import(new URL("module/ship.mjs", dist));
  const ship = {
    shipClass: 0, crewCount: 10, forcedMode: false, illuminationMode: false,
    fuelStock: 10, provisionsStock: 10, unrest: 24,
    travelSectors: 2, travelWatches: 3.5, lastTransition: ""
  };
  const prepared = prepareSectorTransition(ship, "sector-1");
  assert.deepEqual(prepared.costs, { fuel: 1, provisions: 1, unrest: 1, watches: 1 });
  assert.deepEqual(
    Object.fromEntries(["fuelStock", "provisionsStock", "unrest", "travelSectors", "travelWatches"]
      .map(field => [field, prepared.update[field]])),
    { fuelStock: 9, provisionsStock: 9, unrest: 25, travelSectors: 3, travelWatches: 4.5 }
  );
  assert.equal(ship.fuelStock, 10);
  const applied = { ...ship, ...prepared.update };
  const rollback = rollbackSectorTransition(applied);
  assert.deepEqual(
    Object.fromEntries(["fuelStock", "provisionsStock", "unrest", "travelSectors", "travelWatches"]
      .map(field => [field, rollback[field]])),
    Object.fromEntries(["fuelStock", "provisionsStock", "unrest", "travelSectors", "travelWatches"]
      .map(field => [field, ship[field]]))
  );
  assert.equal(rollback.lastTransition, "");
  assert.deepEqual(rollback.costs, prepared.costs);
  assert.throws(() => rollbackSectorTransition({ ...applied, fuelStock: 8 }), /TransitionConflict/);
  assert.throws(() => prepareSectorTransition({ ...ship, provisionsStock: 0 }, "sector-2"), /TransitionBlocked/);
  assert.throws(() => prepareSectorTransition({ ...ship, travelSectors: Number.MAX_SAFE_INTEGER }, "sector-2"), /InvalidState/);
  assert.throws(() => prepareSectorTransition({ ...ship, travelWatches: Number.MAX_SAFE_INTEGER }, "sector-2"), /InvalidState/);
  assert.throws(() => rollbackSectorTransition({ ...applied, lastTransition: "{" }), /InvalidTransition/);
});

test("only illuminated sectors advance the alternating unrest gain and rollback restores its phase", async () => {
  const { prepareSectorTransition, prepareVoyageReset, rollbackSectorTransition } =
    await import(new URL("module/ship.mjs", dist));
  const initial = { shipClass: 0, crewCount: 10, fuelStock: 10, provisionsStock: 10, unrest: 5,
    travelSectors: 0, travelWatches: 0, illuminationMode: true };
  const first = { ...initial, ...prepareSectorTransition(initial, "first").update };
  assert.equal(first.unrest, 5);
  assert.equal(first.illuminationUnrestPending, true);
  const reset = { ...first, ...prepareVoyageReset(first).update, illuminationMode: false };
  const dark = { ...reset, ...prepareSectorTransition(reset, "dark").update, illuminationMode: true };
  assert.equal(dark.unrest, 6);
  assert.equal(dark.illuminationUnrestPending, true);
  const second = { ...dark, ...prepareSectorTransition(dark, "second").update };
  assert.equal(second.unrest, 7);
  assert.equal(second.illuminationUnrestPending, false);
  const undone = rollbackSectorTransition(second);
  assert.equal(undone.unrest, 6);
  assert.equal(undone.illuminationUnrestPending, true);
});

test("voyage reset preserves the last rollback while keeping reset counters at zero", async () => {
  const { prepareSectorTransition, prepareVoyageReset, rollbackSectorTransition } =
    await import(new URL("module/ship.mjs", dist));
  const ship = {
    shipClass: 0, crewCount: 10, forcedMode: false, illuminationMode: false,
    fuelStock: 10, provisionsStock: 10, unrest: 2,
    travelSectors: 4, travelWatches: 2.5, lastTransition: ""
  };
  const transition = prepareSectorTransition(ship, "sector-1");
  const applied = { ...ship, ...transition.update };
  const reset = prepareVoyageReset(applied);
  assert.equal(reset.rollbackPreserved, true);
  const afterFirstReset = { ...applied, ...reset.update };
  const repeatedReset = prepareVoyageReset(afterFirstReset);
  assert.equal(repeatedReset.rollbackPreserved, true);
  const afterReset = { ...afterFirstReset, ...repeatedReset.update };
  assert.equal(afterReset.travelSectors, 0);
  assert.equal(afterReset.travelWatches, 0);
  assert.equal(afterReset.fuelStock, applied.fuelStock);
  assert.equal(afterReset.unrest, applied.unrest);
  const rollback = rollbackSectorTransition(afterReset);
  assert.equal(rollback.fuelStock, ship.fuelStock);
  assert.equal(rollback.unrest, ship.unrest);
  assert.equal(rollback.travelSectors, 0);
  assert.equal(rollback.travelWatches, 0);
  assert.equal(rollback.costs.watches, 0);

  const conflicted = prepareVoyageReset({ ...applied, fuelStock: applied.fuelStock + 1 });
  assert.equal(conflicted.rollbackPreserved, false);
  assert.throws(() => rollbackSectorTransition({
    ...applied, fuelStock: applied.fuelStock + 1, ...conflicted.update
  }), /TransitionConflict/);
});

test("psychotherapy resolves full and partial successes without negative unrest", async () => {
  const { resolvePsychotherapy } = await import(new URL("module/ship.mjs", dist));
  assert.deepEqual(resolvePsychotherapy(10, 2, 5), { unrest: 5, relief: 5 });
  assert.deepEqual(resolvePsychotherapy(10, 1, 5), { unrest: 8, relief: 2 });
  assert.deepEqual(resolvePsychotherapy(10, 0, 6), { unrest: 10, relief: 0 });
  assert.deepEqual(resolvePsychotherapy(1, 2, 6), { unrest: 0, relief: 1 });
  assert.throws(() => resolvePsychotherapy(26, 2, 6), /InvalidState/);
  assert.throws(() => resolvePsychotherapy(10, 2, 7), /InvalidState/);
});

test("unrest increase rejects fractional gains and is capped at 25", async () => {
  const { prepareUnrestIncrease } = await import(new URL("module/ship.mjs", dist));
  assert.deepEqual(prepareUnrestIncrease(24, 2), { unrest: 25, increase: 1 });
  assert.throws(() => prepareUnrestIncrease(4, 0.5), /InvalidState/);
  assert.deepEqual(prepareUnrestIncrease(25, 1), { unrest: 25, increase: 0 });
  assert.throws(() => prepareUnrestIncrease(4, -1), /InvalidState/);
  assert.throws(() => prepareUnrestIncrease(4, Number.POSITIVE_INFINITY), /InvalidState/);
});

test("debt totals stay separate and exact beyond the safe integer range", async () => {
  const { debtTotals } = await import(new URL("module/finance.mjs", dist));
  assert.deepEqual(debtTotals([
    { direction: "payable", amount: Number.MAX_SAFE_INTEGER }, { direction: "receivable", amount: 25 },
    { direction: "payable", amount: 6 }
  ]), { payable: "9007199254740997", receivable: "25" });
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
