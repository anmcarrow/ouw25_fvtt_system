import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dist = new URL("../dist/ouw25/", import.meta.url);

test("the built package registers models and an editable notes sheet for its declared actor types", async () => {
  const manifest = JSON.parse(await readFile(new URL("system.json", dist), "utf8"));
  const types = Object.keys(manifest.documentTypes.Actor);
  const registration = [];
  const hooks = new Map();
  globalThis.Hooks = {
    once(event, callback) { if (event === "init") callback(); else hooks.set(event, callback); },
    on(event, callback) { hooks.set(event, callback); return callback; },
    off(event, callback) { if (hooks.get(event) === callback) hooks.delete(event); }
  };
  globalThis.CONFIG = { Actor: { dataModels: {}, documentClass: null }, Item: { dataModels: {} } };
  globalThis.CONST = { TOKEN_DISPLAY_MODES: { ALWAYS: 50 } };
  globalThis.foundry = {
    abstract: { TypeDataModel: class { static migrateData(source) { return source; } } },
    data: { fields: { StringField: class { constructor(options) { this.options = options; } }, NumberField: class {}, BooleanField: class {}, ArrayField: class {}, DocumentUUIDField: class {} } },
    applications: {
      api: { HandlebarsApplicationMixin: base => base },
      ux: { FormDataExtended: class {} },
      sheets: { ActorSheetV2: class {
        get element() { return this._element; }
        get form() { return this._form; }
        async _prepareContext() { return {}; }
        async _onRender() {}
        async _onFirstRender() {}
        _onClose() {}
        _toggleDisabled() {}
        async _onDropDocument() { return "base"; }
        _getTabsConfig(group) { return this.constructor.TABS[group]; }
        _onChangeForm() {}
        async _onClickAction() { this.actionInvoked = true; }
        async _processSubmitData(_event, _form, data) { return data; }
      } }
    },
    documents: {
      Actor: class {
        static getDefaultArtwork() { return { img: "icons/svg/mystery-man.svg" }; }
        async _preCreate(data) {
          if (this.veto) return false;
          if (!this.prototypeToken.texture.src || this.prototypeToken.texture.src === "icons/svg/mystery-man.svg") {
            const src = "img" in data ? this.img : this.constructor.getDefaultArtwork({ type: this.type }).texture.src;
            this.prototypeToken.updateSource({ texture: { src } });
          }
        }
        async _preUpdate(changed) {
          if (this.veto) return false;
          if (changed.img && !changed.prototypeToken?.texture?.src
            && this.prototypeToken.texture.src === this.constructor.getDefaultArtwork({ type: this.type }).texture.src) {
            changed.prototypeToken ??= {};
            changed.prototypeToken.texture ??= {};
            changed.prototypeToken.texture.src = changed.img;
          }
        }
        async getTokenDocument(data, options) {
          return { texture: { ...this.prototypeToken.texture, ...data.texture }, options };
        }
      },
      collections: { Actors: { registerSheet: (...args) => registration.push(args) } }
    }
  };
  const registeredSettings = [];
  globalThis.game = { i18n: { localize: key => key }, settings: {
    register: (...args) => registeredSettings.push(args),
    get: () => false
  } };

  await import(new URL(manifest.esmodules[0], dist));
  const { MERCHANT_PASTS, MERCHANT_SPECIALTIES } = await import(new URL("module/merchant.mjs", dist));
  assert.deepEqual(Object.keys(CONFIG.Actor.dataModels), types);
  assert.deepEqual(Object.keys(CONFIG.Item.dataModels), Object.keys(manifest.documentTypes.Item));
  for (const [type, [image, token]] of Object.entries({
    merchant: ["systems/ouw25/styles/images/bugger_transp.webp", "systems/ouw25/styles/images/pc_token.webp"],
    cooperative: ["systems/ouw25/styles/images/ship_logo.webp", "systems/ouw25/styles/images/ship_token.webp"]
  })) {
    assert.deepEqual(CONFIG.Actor.documentClass.getDefaultArtwork({ type }), { img: image, texture: { src: token } });
  }
  assert.deepEqual(CONFIG.Actor.documentClass.getDefaultArtwork({ type: "base" }), { img: "icons/svg/mystery-man.svg" });
  assert.equal(registeredSettings[0][1], "tokenDefaultsMigrated");
  assert.equal(registeredSettings[0][2].scope, "world");
  assert.equal(CONFIG.Actor.dataModels.cooperative.defineSchema().shipName.options.initial, "Бежетка");
  {
    let response;
    CONFIG.Actor.typeLabels = { merchant: "merchant-label", cooperative: "cooperative-label" };
    game.i18n.format = key => key;
    foundry.applications.handlebars = { renderTemplate: async () => "" };
    foundry.applications.api.DialogV2 = { input: async () => response };
    CONFIG.Actor.documentClass.create = async (data, options) => ({ data, options });
    for (const [type, supplied, expected] of [
      ["cooperative", "", "LLC W'Ell"], ["cooperative", "My company", "My company"],
      ["merchant", "", "Brrg Caddck"], ["merchant", "My merchant", "My merchant"]
    ]) {
      response = { type, name: supplied };
      const created = await CONFIG.Actor.documentClass.createDialog();
      assert.equal(created.data.name, expected);
      assert.equal(created.data.type, type);
    }
  }
  for (const [type, token, portrait] of [
    ["merchant", "systems/ouw25/styles/images/pc_token.webp", "systems/ouw25/styles/images/bugger_transp.webp"],
    ["cooperative", "systems/ouw25/styles/images/ship_token.webp", "systems/ouw25/styles/images/ship_logo.webp"]
  ]) {
    const makeActor = (src = "icons/svg/mystery-man.svg", randomImg = false) => {
      const actor = new CONFIG.Actor.documentClass();
      actor.type = type;
      actor.img = "custom-portrait.webp";
      actor.prototypeToken = {
        randomImg, displayName: 0, lockRotation: false, texture: { src },
        updateSource(update) {
          Object.assign(this.texture, update.texture);
          if (Object.hasOwn(update, "displayName")) this.displayName = update.displayName;
          if (Object.hasOwn(update, "lockRotation")) this.lockRotation = update.lockRotation;
        }
      };
      return actor;
    };
    for (const data of [{}, { img: "custom-portrait.webp" }]) {
      const actor = makeActor();
      await actor._preCreate(data, {}, {});
      assert.equal(actor.prototypeToken.texture.src, token);
      assert.equal(actor.prototypeToken.displayName, 50);
      assert.equal(actor.prototypeToken.lockRotation, true);
    }
    const custom = makeActor("custom-token.webp");
    await custom._preCreate({ prototypeToken: { texture: { src: "custom-token.webp" } } }, {}, {});
    assert.equal(custom.prototypeToken.texture.src, "custom-token.webp");
    const wildcard = makeActor("tokens/*.webp", true);
    await wildcard._preCreate({ prototypeToken: { randomImg: true, texture: { src: "tokens/*.webp" } } }, {}, {});
    assert.equal(wildcard.prototypeToken.texture.src, "tokens/*.webp");
    assert.equal(wildcard.prototypeToken.displayName, 50);
    const hiddenName = makeActor("custom-token.webp");
    await hiddenName._preCreate({ prototypeToken: { displayName: 0, lockRotation: false, texture: { src: "custom-token.webp" } } }, {}, {});
    assert.equal(hiddenName.prototypeToken.displayName, 0);
    assert.equal(hiddenName.prototypeToken.lockRotation, false);
    const imported = makeActor(portrait);
    await imported._preCreate({ prototypeToken: { texture: { src: portrait } } }, { fromCompendium: true }, {});
    assert.equal(imported.prototypeToken.texture.src, token);
    const explicitlySelected = makeActor(portrait);
    await explicitlySelected._preCreate({ prototypeToken: { texture: { src: portrait } } }, {}, {});
    assert.equal(explicitlySelected.prototypeToken.texture.src, portrait);
    const dropOptions = { parent: "scene" };
    const dropped = await explicitlySelected.getTokenDocument({ texture: { scaleX: 2 } }, dropOptions);
    assert.deepEqual(dropped, { texture: { src: token, scaleX: 2 }, options: dropOptions });
    assert.equal(explicitlySelected.prototypeToken.texture.src, portrait);
    assert.equal((await explicitlySelected.getTokenDocument({ texture: { src: "chosen-token.webp" } })).texture.src, "chosen-token.webp");
    assert.equal((await custom.getTokenDocument()).texture.src, "custom-token.webp");
    assert.equal((await wildcard.getTokenDocument()).texture.src, "tokens/*.webp");
    globalThis.game.settings.get = () => true;
    assert.equal((await explicitlySelected.getTokenDocument()).texture.src, portrait);
    globalThis.game.settings.get = () => false;
    const vetoed = makeActor();
    vetoed.veto = true;
    assert.equal(await vetoed._preCreate({}, {}, {}), false);
    assert.equal(vetoed.prototypeToken.texture.src, "icons/svg/mystery-man.svg");
    const actor = makeActor(token);
    const portraitChange = { img: "new-portrait.webp", prototypeToken: { width: 2 } };
    await actor._preUpdate(portraitChange, {}, {});
    assert.deepEqual(portraitChange, { img: "new-portrait.webp", prototypeToken: { width: 2 } });
    const explicitChange = { img: "new-portrait.webp", prototypeToken: { texture: { src: "chosen-token.webp" } } };
    await actor._preUpdate(explicitChange, {}, {});
    assert.equal(explicitChange.prototypeToken.texture.src, "chosen-token.webp");
  }
  {
    let migrated = false;
    let fail = true;
    const notifications = [];
    const records = [
      ["merchant", "systems/ouw25/styles/images/bugger_transp.webp", false],
      ["cooperative", "icons/svg/mystery-man.svg", false],
      ["merchant", "custom-token.webp", false],
      ["cooperative", "systems/ouw25/styles/images/ship_logo.webp", true],
      ["other", "icons/svg/mystery-man.svg", false]
    ].map(([type, src, randomImg], id) => ({
      id, type, prototypeToken: { texture: { src }, randomImg },
      async update(changed) {
        if (fail) throw new Error("simulated failure");
        this.prototypeToken.texture.src = changed["prototypeToken.texture.src"];
        return this;
      }
    }));
    globalThis.game.actors = records;
    globalThis.game.user = { isActiveGM: false };
    globalThis.game.settings.get = () => migrated;
    globalThis.game.settings.set = async (_system, _key, value) => { migrated = value; };
    globalThis.ui = { notifications: { error: message => notifications.push(message) } };
    const ready = hooks.get("ready");
    await ready();
    assert.equal(migrated, false);
    globalThis.game.user.isActiveGM = true;
    const originalConsoleError = console.error;
    try {
      console.error = () => {};
      await ready();
    } finally { console.error = originalConsoleError; }
    assert.equal(migrated, false);
    assert.deepEqual(notifications, ["OUW25.TokenMigrationError"]);
    fail = false;
    await ready();
    assert.equal(migrated, true);
    assert.deepEqual(records.map(actor => actor.prototypeToken.texture.src), [
      "systems/ouw25/styles/images/pc_token.webp", "systems/ouw25/styles/images/ship_token.webp",
      "custom-token.webp", "systems/ouw25/styles/images/ship_logo.webp", "icons/svg/mystery-man.svg"
    ]);
    records[0].prototypeToken.texture.src = "systems/ouw25/styles/images/bugger_transp.webp";
    await ready();
    assert.equal(records[0].prototypeToken.texture.src, "systems/ouw25/styles/images/bugger_transp.webp");
    hooks.delete("ready");
  }
  const [[id, Sheet, options]] = registration;
  assert.equal(id, manifest.id);
  assert.deepEqual(options.types, types);

  const templatePath = Sheet.PARTS.notes.template.replace(`systems/${id}/`, "");
  const template = await readFile(new URL(templatePath, dist), "utf8");
  assert.match(template, /name="system\.notes"/);
  assert.match(template, /type="submit"/);
  assert.match(template, /data-autosave-status/);
  assert.match(template, /<output\b[^>]*ouw25-hold-status[^>]*occupied=ship\.hold\.occupied capacity=ship\.hold\.capacity/);
  assert.match(template, /\{\{#if ship\.hold\.nearFull\}\} class="ouw25-hold-warning"\{\{\/if\}\}\{\{#if ship\.hold\.overloaded\}\} class="ouw25-hold-warning"\{\{\/if\}\}>\{\{ship\.hold\.occupied\}\}/);
  assert.match(template, /<h4 class="ouw25-trait-name"\{\{#if tooltip\}\} tabindex="0" data-tooltip="\{\{localize tooltip\}\}"/);
  const recordActions = template.match(/\{\{#\*inline "ouw25-record-actions"\}\}([\s\S]*?)\{\{\/inline\}\}/)?.[1];
  assert.ok(recordActions);
  for (const [action, label] of [["editRecord", "Edit"], ["deleteRecord", "Delete"]]) {
    assert.match(recordActions, new RegExp(`class="ouw25-trait-icon" data-action="${action}"[^>]*aria-label="\\{\\{localize "OUW25\\.Debt\\.${label}"\\}\\}"`));
  }
  assert.match(template, /<fieldset class="ouw25-cooperative-budget">[\s\S]*?heading="OUW25\.Finance\.Budget"[\s\S]*?\{\{> ouw25-money-input\}\}/);
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
      gear1: "sandshoes", reputation: "hunters", memory: "rescue"
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
    {
      let permitted = true;
      let opened = 0;
      let tokenOpened = 0;
      const prototype = {};
      globalThis.game.user = { can: permission => permission === "TOKEN_CONFIGURE" && permitted };
      CONFIG.Token = { prototypeSheetClass: class {
        constructor(options) { assert.equal(options.prototype, prototype); }
        render(options) { assert.deepEqual(options, { force: true }); opened++; }
      } };
      Object.assign(sheet.actor, {
        isOwner: true, prototypeToken: prototype,
        token: { sheet: { render(options) { assert.deepEqual(options, { force: true }); tokenOpened++; } } }
      });
      const configure = () => Sheet.DEFAULT_OPTIONS.actions.configureActorToken.call(sheet);
      sheet.isEditable = true;
      assert.equal((await sheet._prepareContext({})).token.canConfigure, true);
      configure();
      assert.equal(opened, 1);
      sheet.actor.isToken = true;
      configure();
      assert.equal(tokenOpened, 1);
      sheet.actor.isToken = false;
      permitted = false;
      assert.equal((await sheet._prepareContext({})).token.canConfigure, false);
      configure();
      permitted = true;
      sheet.actor.isOwner = false;
      assert.equal((await sheet._prepareContext({})).token.canConfigure, false);
      configure();
      sheet.actor.isOwner = true;
      sheet.isEditable = false;
      assert.equal((await sheet._prepareContext({})).token.canConfigure, false);
      configure();
      sheet.isEditable = true;
      sheet.actor.type = "base";
      configure();
      assert.equal(opened, 1);
      assert.equal(tokenOpened, 1);
      sheet.actor.type = type;
      sheet.actor.isOwner = false;
    }
    assert.deepEqual(sheet._getTabsConfig("sheet").tabs.map(({ id }) => id), merchant
      ? ["attributes", "items", "friends", "illwishers", "creditors", "notes"]
      : ["attributes", "contacts", "contracts", "ports", "ship", "cargo"]);
    for (const editable of [true, false]) {
      sheet.isEditable = editable;
      const { token, ship, traits, identity, pastMoves, contacts, contracts, showContracts, cargo, ports, cooperative, collisionAssistant, ...context } = await sheet._prepareContext({});
      assert.deepEqual(token, {
        icon: `systems/ouw25/styles/images/${merchant ? "pc" : "ship"}_token.webp`,
        label: merchant ? "OUW25.Identity.ConfigureToken" : "OUW25.Ship.ConfigureToken",
        canConfigure: false
      });
      assert.equal(showContracts, !merchant);
      assert.equal(pastMoves, null);
      if (merchant) {
        assert.equal(cargo, null);
        assert.equal(ports, null);
        assert.equal(contracts, null);
        assert.equal(contacts, null);
        assert.equal(cooperative, null);
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
        assert.equal(cooperative.name, "Original");
        assert.equal(cooperative.reputation.choices.find(choice => choice.selected).value, "hunters");
        assert.equal(cooperative.reputation.help, "OUW25.Cooperative.Reputation.Help.hunters");
        assert.equal(cooperative.memory.choices.find(choice => choice.selected).value, "rescue");
        assert.equal(cooperative.memory.help, "OUW25.Cooperative.Memory.Help.rescue");
        for (const language of ["en", "ru"]) {
          const texts = JSON.parse(await readFile(new URL(`lang/${language}.json`, dist), "utf8"));
          assert.ok(texts.OUW25.Ship.ConfigureToken);
          assert.ok(texts.OUW25.Identity.ConfigureToken);
          for (const code of ["slagthrower", "harpoon", "water_cannon", "winch", "passenger", "premium", "diving", "sandshoes", "tow"]) {
            assert.ok(texts.OUW25.Ship.EquipmentEffects[code], `${language}: missing equipment effect ${code}`);
          }
          for (const [category, selection] of Object.entries({ Reputation: cooperative.reputation, Memory: cooperative.memory })) {
            for (const { value } of selection.choices) {
              assert.ok(texts.OUW25.Cooperative[category].Names[value]);
              if (value !== "unset") assert.ok(texts.OUW25.Cooperative[category].Help[value]);
            }
          }
        }
        assert.equal(cargo.volume, 14.75);
        assert.deepEqual(ports, { entries: [], discovered: 0, total: 67 });
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
        assert.deepEqual(ship.classes.map(({ value, label }) => ({ value, label })),
          Array.from({ length: 7 }, (_, value) => ({ value, label: `OUW25.Ship.ClassNames.${value}` })));
        assert.equal(ship.classes.find(({ selected }) => selected).value, 0);
        assert.equal(ship.compartmentSpace, 420);
        assert.deepEqual(ship.hold, {
          occupied: 452.25, capacity: 1600, nearFull: false, overloaded: false,
          breakdown: { listed: 14.75, unlisted: 5, compartments: 420, fuel: 10.5, provisions: 2 }
        });
        assert.deepEqual(ship.mounts.entries, []);
        assert.deepEqual(ship.gear.entries, [{
          field: "gear1", name: "OUW25.ShipGear.Names.sandshoes", help: "OUW25.ShipGear.Help.sandshoes"
        }]);
        assert.equal(ship.gear.canAdd, true);
      }
      assert.deepEqual(context, {
        notes: "test note", journalIndex: [], autosaveStatus: "OUW25.SaveStatus.Saved", autosaveStatusState: "saved",
        actorTypeLabel: `TYPES.Actor.${type}`, editable,
        showCollision: editable && merchant,
        money: merchant ? { value: 12, field: "pocketMoney", label: "OUW25.Finance.PocketMoney" }
          : { value: 34, field: "budget", label: "OUW25.Finance.Budget" },
        pension: merchant ? { balance: 30_005, leaves: 1, untilNext: 29_995, complete: false } : null,
        ledger: merchant ? { totals: { payable: "12", receivable: "0" },
          payableWarning: false, payableScale: 2 - 0.16 * Math.log10(13), groups: [
          { label: "OUW25.Debt.payable", entries: [{ id: "debt-1", name: "Creditor", amount: 12, location: "Port" }] },
          { label: "OUW25.Debt.receivable", entries: [] }
        ] } : null,
        relationships: merchant ? [
          { kind: "friend", tab: "friends", label: "OUW25.Relationship.friend", entries: [{ id: "friend-1", name: "Friend", location: "Harbor", reason: "Rescue" }] },
          { kind: "enemy", tab: "illwishers", label: "OUW25.Relationship.enemy", entries: [] }
        ] : null,
        possessions: merchant ? { entries: [{ id: "gear-1", name: "Lantern", amount: 0 }] } : null,
        condition: merchant ? { specialties: MERCHANT_SPECIALTIES.map(value => ({
          value, label: `OUW25.Specialty.${value}`, selected: value === "medic",
          help: value === "unset" ? null : `OUW25.Specialty.Help.${value}`
        })), specialtyConflict: false,
        specialtyRestriction: null, specialtyFormula: "1d4", pasts: MERCHANT_PASTS.map(value => ({
          value, label: `OUW25.Past.${value}`, selected: value === "unset"
        })), showFragile: false, fragile: false, luck: 0, canSpend: false, canAdd: true, wounds: [
          { slot: 1, marked: true, lethal: false }, { slot: 2, marked: false, lethal: false },
          { slot: 3, marked: false, lethal: true }
        ] } : null
      });

    }
    if (!merchant) {
      for (const [count, percent] of [[0, 100], [4, 100], [5, 50], [6, 50], [11, 50], [2, 100]]) {
        for (let slot = 1; slot <= 11; slot++) sheet.actor.system[`damage${slot}`] = slot <= count;
        const { condition } = (await sheet._prepareContext({})).ship;
        assert.equal(condition.damaged, count);
        assert.equal(condition.tabIconPercent, percent);
        assert.equal(condition.tabDestroyed, count >= 3);
        assert.equal(condition.tabDamage.length, count);
        assert.ok(condition.tabDamage.every(slot => slot.marked));
      }
      for (let slot = 1; slot <= 11; slot++) sheet.actor.system[`damage${slot}`] = false;
      Object.assign(sheet.actor.system, { damage1: true, damage5: true });
      let condition = (await sheet._prepareContext({})).ship.condition;
      assert.equal(condition.tabDestroyed, true);
      assert.deepEqual(condition.tabDamage.map(slot => slot.number), [1, 5]);
      Object.assign(sheet.actor.system, { damage3: true, damage5: false, merit1: "strong_hull" });
      condition = (await sheet._prepareContext({})).ship.condition;
      assert.equal(condition.tabDestroyed, false);
      assert.deepEqual(condition.tabDamage.map(slot => slot.number), [1, 3]);
      Object.assign(sheet.actor.system, { damage1: false, damage3: false, merit1: "none" });
      Object.assign(sheet.actor.system, { reputation: "unset", memory: "unset" });
      const { cooperative } = await sheet._prepareContext({});
      assert.equal(cooperative.reputation.choices.find(choice => choice.selected).value, "unset");
      assert.equal(cooperative.memory.choices.find(choice => choice.selected).value, "unset");
      assert.equal(cooperative.reputation.help, null);
      assert.equal(cooperative.memory.help, null);
      Object.assign(sheet.actor.system, { fuelStock: 0, crewCount: 0, provisionsStock: 0,
        travelStatus: "OUW25.Voyage.EnableForced: earlier check" });
      sheet.isEditable = true;
      const { ship } = await sheet._prepareContext({});
      assert.equal(ship.travelStatus, "");
      assert.equal(ship.canTravel, false);
      assert.ok(ship.voyage.shortages.includes("OUW25.Voyage.FuelShortage"));
      assert.deepEqual(ship.voyage.displayShortages, ["OUW25.Voyage.NoCrew", "OUW25.Voyage.NoProvisions"]);
      sheet.actor.system.travelStatus = "Travel completed";
      assert.equal((await sheet._prepareContext({})).ship.travelStatus, "Travel completed");
      Object.assign(sheet.actor.system, { mount1: "harpoon", mount2: "harpoon", mount3: "winch",
        compartment1: "passenger", compartment2: "passenger", compartment5: "diving", gear1: "tow" });
      for (const code of ["slagthrower", "harpoon", "water_cannon", "winch"]) {
        sheet.actor.system.mount1 = code;
        const [entry] = (await sheet._prepareContext({})).ship.mounts.entries;
        assert.equal(entry.tooltip, `OUW25.Ship.EquipmentEffects.${code}`);
      }
      sheet.actor.system.mount1 = "harpoon";
      assert.deepEqual((await sheet._prepareContext({})).ship.equipmentEffects, [
        "OUW25.Ship.EquipmentEffects.harpoon", "OUW25.Ship.EquipmentEffects.harpoon",
        "OUW25.Ship.EquipmentEffects.passenger", "OUW25.Ship.EquipmentEffects.passenger",
        "OUW25.Ship.EquipmentEffects.tow"
      ]);
      Object.assign(sheet.actor.system, { mount1: "none", mount2: "none", compartment1: "none",
        compartment2: "none", gear1: "none" });
      assert.deepEqual((await sheet._prepareContext({})).ship.equipmentEffects, []);
      sheet.actor.items.push(
        { type: "port", id: "p1", name: "Олъм", system: { region: "Олъм Нде", description: "Столица" } },
        { type: "port", id: "p2", name: "ОЛЪМ", system: { region: "", description: "" } },
        { type: "port", id: "p3", name: "Мой остров", system: { region: "", description: "" } }
      );
      let places = (await sheet._prepareContext({})).ports;
      assert.equal(places.discovered, 1);
      assert.deepEqual(places.entries[0], { id: "p1", name: "Олъм", region: "Олъм Нде", description: "Столица" });
      sheet.actor.items.find(item => item.id === "p2").name = "Салайф";
      places = (await sheet._prepareContext({})).ports;
      assert.equal(places.discovered, 2);
      sheet.actor.items = sheet.actor.items.filter(item => item.id !== "p1");
      assert.equal((await sheet._prepareContext({})).ports.discovered, 1);
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

  sheet.actor.system.illuminationMode = false;
  let pendingIllumination;
  const illumination = {
    name: "system.illuminationMode", type: "checkbox", checked: false, disabled: false, readOnly: false,
    dataset: {}, checkValidity: () => true,
    click() {
      this.checked = !this.checked;
      pendingIllumination = change({ target: this });
    }
  };
  const toggle = { setAttribute: (name, value) => { toggle[name] = value; } };
  sheet._element.querySelector = selector => selector === "[data-autosave-status]" ? autosaveStatus
    : selector === 'input[name="system.illuminationMode"]' ? illumination : null;
  for (const expected of [true, false]) {
    Sheet.DEFAULT_OPTIONS.actions.toggleIlluminationMode.call(sheet, null, toggle);
    await pendingIllumination;
    assert.equal(sheet.actor.system.illuminationMode, expected);
    assert.equal(toggle["aria-pressed"], String(expected));
  }
  sheet.isEditable = false;
  Sheet.DEFAULT_OPTIONS.actions.toggleIlluminationMode.call(sheet, null, toggle);
  assert.equal(illumination.checked, false);
  sheet.isEditable = true;
  illumination.disabled = true;
  Sheet.DEFAULT_OPTIONS.actions.toggleIlluminationMode.call(sheet, null, toggle);
  assert.equal(illumination.checked, false);
  illumination.disabled = false;

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

  const shipSheet = new Sheet();
  shipSheet.isEditable = true;
  const shipSystem = {
    shipClass: 0, cargoLoad: 0, fuelStock: 0, provisionsStock: 0, holdBonus: 0,
    merit1: "strong_hull", merit2: "none", merit3: "none", merit4: "none",
    flaw1: "none", flaw2: "none", flaw3: "none", flaw4: "none",
    gear1: "sandshoes", gear2: "none", mount1: "slagthrower", mount2: "none",
    compartment1: "passenger", compartment2: "none", compartment3: "none", compartment4: "none"
  };
  shipSheet.actor = {
    type: "cooperative", system: shipSystem, items: [],
    async update(changes) { for (const [path, value] of Object.entries(changes)) shipSystem[path.slice(7)] = value; }
  };
  const warnings = [];
  globalThis.ui = { notifications: { warn: value => warnings.push(value) } };
  let response = { code: "strong_hull" };
  let choices;
  foundry.applications.handlebars = { renderTemplate: async (_path, context) => {
    choices = context.choices;
    return "";
  } };
  foundry.applications.api.DialogV2 = { input: async () => response, confirm: async () => true };
  const editShip = (kind, field) => Sheet.DEFAULT_OPTIONS.actions.editShipEntry.call(shipSheet, null, { dataset: { kind, field } });
  const deleteShip = (kind, field) => Sheet.DEFAULT_OPTIONS.actions.deleteShipEntry.call(shipSheet, null, { dataset: { kind, field } });
  await editShip("merit");
  assert.equal(choices.find(choice => choice.value === "strong_hull").disabled, true);
  assert.equal(shipSystem.merit2, "none");
  assert.equal(warnings.pop(), "OUW25.ShipQuality.Duplicates");
  response = { code: "worn_engine" };
  await editShip("flaw");
  assert.equal(shipSystem.flaw1, "worn_engine");
  response = { code: "winch" };
  await editShip("mount");
  assert.equal(shipSystem.mount2, "winch");
  response = { code: "tow" };
  await editShip("gear", "gear1");
  assert.equal(shipSystem.gear1, "tow");
  await deleteShip("gear", "gear1");
  assert.equal(shipSystem.gear1, "none");
  shipSystem.cargoLoad = 1100;
  response = { code: "diving" };
  await editShip("compartment");
  assert.equal(choices.find(choice => choice.value === "diving").disabled, true);
  assert.equal(shipSystem.compartment2, "none");
  assert.equal(warnings.pop(), "OUW25.Ship.CompartmentDoesNotFit");
  shipSheet.isEditable = false;
  await deleteShip("mount", "mount1");
  assert.equal(shipSystem.mount1, "slagthrower");
  shipSheet.isEditable = true;
  foundry.applications.api.DialogV2.confirm = async () => { shipSystem.mount1 = "harpoon"; return true; };
  await deleteShip("mount", "mount1");
  assert.equal(shipSystem.mount1, "harpoon");
  assert.equal(warnings.pop(), "OUW25.Creation.Changed");

  const memberSheet = new Sheet();
  memberSheet.id = "founder-sheet";
  memberSheet.isEditable = true;
  let renders = 0;
  memberSheet.render = () => { renders++; };
  const memberSystem = { ...shipSystem, founders: [] };
  memberSheet.actor = {
    type: "cooperative", system: memberSystem, items: [],
    async update(changes) { memberSystem.founders = changes["system.founders"]; }
  };
  game.user = { id: "viewer" };
  let permission = "OBSERVER";
  let opened = 0;
  const merchant = {
    uuid: "Actor.merchant1", type: "merchant", name: "Merchant", img: "portrait.webp", apps: {},
    system: { specialty: "mechanic", past: "veteran", pocketMoney: 24, pensionBalance: 30000 },
    items: [
      { type: "debt", system: { direction: "payable", amount: 17 } },
      { type: "debt", system: { direction: "receivable", amount: 999 } },
      { type: "relationship", system: { direction: "friend" } },
      { type: "relationship", system: { direction: "enemy" } }
    ],
    testUserPermission: (_user, level) => permission === "OBSERVER" || (permission === "LIMITED" && level === "LIMITED"),
    sheet: { async render() { opened++; } }
  };
  globalThis.fromUuid = async uuid => uuid === merchant.uuid ? merchant : null;
  const inside = { target: { closest: () => true } };
  const outside = { target: { closest: () => null } };
  assert.equal(await memberSheet._onDropDocument(inside, { documentName: "Item" }), null);
  assert.equal(await memberSheet._onDropDocument(outside, { documentName: "Item" }), "base");
  const portraitButton = { disabled: true };
  memberSheet._element = { querySelectorAll: () => [portraitButton] };
  memberSheet._toggleDisabled(true);
  assert.equal(portraitButton.disabled, false);
  await memberSheet._onDropActor(outside, merchant);
  assert.deepEqual(memberSystem.founders, []);
  await memberSheet._onDropActor(inside, { ...merchant, type: "cooperative" });
  assert.deepEqual(memberSystem.founders, []);
  await memberSheet._onDropActor(inside, merchant);
  await memberSheet._onDropActor(inside, merchant);
  assert.deepEqual(memberSystem.founders, [merchant.uuid]);
  let memberContext = await memberSheet._prepareContext({});
  assert.deepEqual(memberContext.cooperative.founders[0].stats, {
    wounds: [], specialty: "OUW25.Specialty.mechanic", past: "OUW25.Past.veteran", money: 24,
    debt: "17", savings: 30000, friends: 1, enemies: 1, creditors: 1
  });
  await memberSheet._onFirstRender(memberContext, {});
  hooks.get("updateActor")(merchant);
  hooks.get("updateItem")({ parent: { uuid: merchant.uuid } });
  hooks.get("deleteItem")({ parent: { uuid: "Actor.other" } });
  assert.equal(renders, 2);
  merchant.system.pocketMoney = 40;
  assert.equal((await memberSheet._prepareContext({})).cooperative.founders[0].stats.money, 40);
  merchant.items.push({ type: "debt", system: { direction: "payable", amount: Number.MAX_SAFE_INTEGER } });
  const updatedStats = (await memberSheet._prepareContext({})).cooperative.founders[0].stats;
  assert.equal(updatedStats.debt, "9007199254741008");
  assert.equal(updatedStats.creditors, 2);
  Object.assign(merchant.system, { wound1: true, wound2: false, wound3: true, wound4: true });
  assert.deepEqual((await memberSheet._prepareContext({})).cooperative.founders[0].stats.wounds, [
    { slot: 1, lethal: false }, { slot: 3, lethal: true }
  ]);
  Object.assign(merchant.system, { past: "artist", wound2: true });
  assert.deepEqual((await memberSheet._prepareContext({})).cooperative.founders[0].stats.wounds, [
    { slot: 1, lethal: false }, { slot: 2, lethal: true }
  ]);
  await Sheet.DEFAULT_OPTIONS.actions.openFounder.call(memberSheet, null, { dataset: { uuid: merchant.uuid } });
  assert.equal(opened, 1);
  permission = "LIMITED";
  memberContext = await memberSheet._prepareContext({});
  assert.equal(memberContext.cooperative.founders[0].stats, undefined);
  permission = "NONE";
  memberContext = await memberSheet._prepareContext({});
  assert.deepEqual(memberContext.cooperative.founders[0], { uuid: merchant.uuid });
  await Sheet.DEFAULT_OPTIONS.actions.openFounder.call(memberSheet, null, { dataset: { uuid: merchant.uuid } });
  assert.equal(opened, 1);
  memberSheet.isEditable = false;
  await Sheet.DEFAULT_OPTIONS.actions.removeFounder.call(memberSheet, null, { dataset: { uuid: merchant.uuid } });
  assert.equal(memberSystem.founders.length, 1);
  memberSheet.isEditable = true;
  await Sheet.DEFAULT_OPTIONS.actions.removeFounder.call(memberSheet, null, { dataset: { uuid: merchant.uuid } });
  assert.deepEqual(memberSystem.founders, []);
  hooks.get("deleteActor")(merchant);
  assert.equal(renders, 2);
  await memberSheet._onClose({});
  assert.equal(hooks.size, 0);

  const placeSheet = new Sheet();
  placeSheet.isEditable = true;
  const places = [];
  places.get = id => places.find(item => item.id === id);
  placeSheet.actor = {
    type: "cooperative", items: places,
    async createEmbeddedDocuments(_type, [item]) { places.push({ ...item, id: "port-1" }); },
    async updateEmbeddedDocuments(_type, [update]) {
      Object.assign(places.get(update._id), { name: update.name, system: update.system });
    },
    async deleteEmbeddedDocuments(_type, [id]) { places.splice(places.findIndex(item => item.id === id), 1); }
  };
  foundry.utils = { randomID: () => "test" };
  foundry.applications.api.DialogV2.confirm = async () => true;
  response = { name: " Олъм ", region: " Остров ", description: " Порт " };
  const editPlace = id => Sheet.DEFAULT_OPTIONS.actions.editRecord.call(placeSheet, null, {
    dataset: { recordType: "port", ...(id && { recordId: id }) }
  });
  const deletePlace = () => Sheet.DEFAULT_OPTIONS.actions.deleteRecord.call(placeSheet, null, {
    dataset: { recordType: "port", recordId: "port-1" }
  });
  await editPlace();
  assert.deepEqual(places[0], { type: "port", id: "port-1", name: "Олъм", system: { region: "Остров", description: "Порт" } });
  response = { name: "Салайф", region: "Другое", description: "Текст" };
  await editPlace("port-1");
  assert.equal(places[0].name, "Салайф");
  assert.equal(places[0].system.description, "Текст");
  placeSheet.isEditable = false;
  await deletePlace();
  assert.equal(places.length, 1);
  placeSheet.isEditable = true;
  await deletePlace();
  assert.equal(places.length, 0);

  shipSystem.flaw1 = "none";
  shipSystem.forcedMode = false;
  shipSystem.travelStatus = "previous result";
  response = { additionalDice: 0, complications: 0 };
  game.i18n.format = (key, values) => `${key} ${JSON.stringify(values)}`;
  game.settings = { get: () => "public" };
  foundry.dice = { Roll: class {
    async evaluate() {
      this.dice = [{ results: [6, 4, 2, 1].map(result => ({ active: true, result })) }];
      return this;
    }
  } };
  let chatMessage;
  foundry.documents.ChatMessage = {
    getSpeaker: () => ({}), applyRollMode() {}, applyMode() {}, create: async message => { chatMessage = message; }
  };
  let checkCard;
  foundry.applications.handlebars.renderTemplate = async (_path, data) => {
    checkCard = data;
    return "check card";
  };
  await Sheet.DEFAULT_OPTIONS.actions.toggleForcedMode.call(shipSheet, null, { disabled: false });
  assert.equal(shipSystem.travelStatus, "");
  assert.equal(chatMessage.flavor, "check card");
  assert.ok(checkCard.result.includes("OUW25.Collision.Result"));
  assert.equal(checkCard.state, "OUW25.CheckCard.Applied");
  assert.equal(chatMessage.rolls.length, 1);

  Object.assign(shipSystem, {
    shipName: "Ship", crewCount: 10, forcedMode: false, illuminationMode: false,
    fuelStock: 10, provisionsStock: 10, unrest: 25, travelSectors: 0, travelWatches: 0,
    illuminationUnrestPending: false, lastTransition: ""
  });
  shipSheet.actor.name = "Cooperative";
  shipSheet.actor.testUserPermission = user => user.id === "operator";
  game.users = [{ id: "operator" }, { id: "stranger" }, { id: "gm", isGM: true }];
  foundry.applications.handlebars.renderTemplate = async (_path, data) => {
    assert.equal(data.fields[2].delta, 0);
    return "voyage card";
  };
  const messages = [];
  foundry.documents.ChatMessage.create = async message => messages.push(message);
  const voyageButton = { disabled: false, closest: () => ({ elements: { namedItem: () => null } }) };
  foundry.applications.api.DialogV2.confirm = async () => false;
  await Sheet.DEFAULT_OPTIONS.actions.travelSector.call(shipSheet, null, voyageButton);
  assert.equal(messages.length, 0);
  assert.equal(shipSystem.fuelStock, 10);
  foundry.applications.api.DialogV2.confirm = async () => true;
  await Sheet.DEFAULT_OPTIONS.actions.travelSector.call(shipSheet, null, voyageButton);
  assert.equal(shipSystem.fuelStock, 9);
  assert.equal(messages[0].content, "voyage card");
  assert.deepEqual(messages[0].whisper, ["operator", "gm"]);
  await Sheet.DEFAULT_OPTIONS.actions.undoSector.call(shipSheet, null, voyageButton);
  assert.equal(shipSystem.fuelStock, 10);
  assert.equal(messages.length, 2);

  const checkSheet = new Sheet();
  checkSheet.isEditable = true;
  checkSheet.actor = { id: "merchant", uuid: "Actor.merchant", documentName: "Actor", type: "merchant",
    name: "Merchant", system: { past: "artist", luck: 1, pocketMoney: 500 }, testUserPermission: () => true };
  game.actors = new Map([[checkSheet.actor.id, checkSheet.actor]]);
  let checkDialog;
  foundry.applications.handlebars.renderTemplate = async () => "check form";
  foundry.applications.api.DialogV2 = class {
    constructor(config) { checkDialog = config; this.handlers = {}; }
    addEventListener(event, callback) { this.handlers[event] = callback; }
    render() { this.handlers.close(); }
  };
  const rollTarget = { disabled: false };
  await Sheet.DEFAULT_OPTIONS.actions.rollCollision.call(checkSheet, null, rollTarget);
  assert.equal(checkDialog.content, "check form");
  assert.equal(checkDialog.modal, false);
  assert.equal(rollTarget.disabled, false);

  await Promise.all([...manifest.styles, ...manifest.languages.map(({ path }) => path)]
    .map(path => readFile(new URL(path, dist))));
});

test("discovered ports count unique canonical names and known spelling variants", async () => {
  const { PORT_COUNT, discoveredPorts } = await import(new URL("module/ports.mjs", dist));
  assert.equal(PORT_COUNT, 67);
  assert.equal(discoveredPorts([" Олъм ", "ОЛЪМ", "Н’те Поа", "Н`те Поа", "Пэнллн", "Пенллн", "Ррэф", "Неизвестный порт"]), 4);
  assert.equal(discoveredPorts(["Салайф", "Костегрыз", "Кра'Кас"]), 3);
  assert.equal(discoveredPorts(["почти Олъм", "", "несуществующий"]), 0);
});

test("voyage cards report actual deltas and never widen message recipients", async () => {
  const { voyageCardData, restrictVoyageRecipients, publishVoyageCard } = await import(new URL("module/voyage-chat.mjs", dist));
  const before = { fuelStock: 9, provisionsStock: 4, unrest: 25, travelSectors: 0, travelWatches: 0 };
  const after = { fuelStock: 10, provisionsStock: 5, unrest: 24, travelSectors: 0, travelWatches: 0 };
  const actor = {
    name: "Cooperative", system: { shipName: "Ship" },
    testUserPermission: user => user.id === "observer"
  };
  const card = voyageCardData(actor, before, after, true);
  assert.equal(card.title, "OUW25.Voyage.UndoSector");
  assert.deepEqual(card.fields.map(field => field.delta), [1, 1, -1, 0, 0]);
  const users = [{ id: "gm", isGM: true }, { id: "observer" }, { id: "stranger" }];
  const publicMessage = {};
  restrictVoyageRecipients(publicMessage, users, actor);
  assert.deepEqual(publicMessage.whisper, ["gm", "observer"]);
  const privateMessage = { whisper: ["gm", "stranger"] };
  restrictVoyageRecipients(privateMessage, users, actor, "gm");
  assert.deepEqual(privateMessage.whisper, ["gm"]);
  assert.throws(() => restrictVoyageRecipients({ whisper: ["stranger"] }, users, actor, "gm"));
  assert.throws(() => restrictVoyageRecipients({}, users, actor, "blind"));

  const errors = [];
  globalThis.game = { users, settings: { get: () => "public" }, i18n: { localize: key => key } };
  globalThis.ui = { notifications: { error: value => errors.push(value) } };
  globalThis.foundry = {
    applications: { handlebars: { renderTemplate: async () => "<article>card</article>" } },
    documents: { ChatMessage: {
      getSpeaker: () => ({}), applyMode() {}, create: async () => { throw new Error("chat unavailable"); }
    } }
  };
  const originalError = console.error;
  try {
    console.error = () => {};
    await publishVoyageCard(actor, before, after, false);
  } finally { console.error = originalError; }
  assert.deepEqual(errors, ["OUW25.Voyage.CardFailedApplied"]);
});

test("record search filters text without changing record data or confusing empty tables", async () => {
  const { filterRecordTable } = await import(new URL("module/record-search.mjs", dist));
  const rows = ["Олъм Северный порт", "Салайф Архипелаг"].map(searchText => ({ dataset: { searchText } }));
  const noMatches = { hidden: true };
  const container = {
    querySelectorAll: () => rows,
    querySelector: () => noMatches
  };
  filterRecordTable(container, " ПОРТ ");
  assert.deepEqual(rows.map(row => row.hidden), [false, true]);
  assert.equal(noMatches.hidden, true);
  filterRecordTable(container, "нет");
  assert.deepEqual(rows.map(row => row.hidden), [true, true]);
  assert.equal(noMatches.hidden, false);
  filterRecordTable(container, "");
  assert.deepEqual(rows.map(row => row.hidden), [false, false]);
  assert.equal(noMatches.hidden, true);
  assert.equal(rows[0].dataset.searchText, "Олъм Северный порт");
  container.querySelectorAll = () => [];
  filterRecordTable(container, "нет");
  assert.equal(noMatches.hidden, true);

  const template = await readFile(new URL("templates/actor-notes.hbs", dist), "utf8");
  for (const entries of ["contacts.entries", "ports.entries", "contracts", "cargo.entries", "possessions.entries"]) {
    assert.match(template, new RegExp(`{{#each ${entries.replaceAll(".", "\\.")}}}\\s*<tr data-record-row`));
  }
  assert.equal((template.match(/<tr data-record-row/g) ?? []).length, 7);
});

test("record sorting is stable, reversible and independent of search", async () => {
  const { sortRecordTable, filterRecordTable } = await import(new URL("module/record-search.mjs", dist));
  const rows = [
    { dataset: { searchText: "pear", sortName: "pear", sortNumber: "2.5" } },
    { dataset: { searchText: "apple", sortName: "apple", sortNumber: "12" } },
    { dataset: { searchText: "apricot", sortName: "apricot", sortNumber: "12" } }
  ];
  const marker = { hidden: true, parentNode: { insertBefore(row) {
    rows.splice(rows.indexOf(row), 1);
    rows.push(row);
  } } };
  const container = { querySelectorAll: () => rows, querySelector: () => marker };
  filterRecordTable(container, "ap");
  sortRecordTable(container, "number");
  assert.deepEqual(rows.map(row => row.dataset.sortName), ["apple", "apricot", "pear"]);
  assert.deepEqual(rows.map(row => row.hidden), [false, false, true]);
  sortRecordTable(container, "name");
  assert.deepEqual(rows.map(row => row.dataset.sortName), ["apple", "apricot", "pear"]);
  sortRecordTable(container, "original");
  assert.deepEqual(rows.map(row => row.dataset.sortName), ["pear", "apple", "apricot"]);
  assert.deepEqual(rows.map(row => row.dataset.sortNumber), ["2.5", "12", "12"]);
});

test("backlinks only reveal accessible visible explicit references and recheck access on opening", async () => {
  const { findJournalBacklinks, journalIndexForActor, openJournalBacklink } = await import(new URL("module/record-journal.mjs", dist));
  const user = {};
  const uuid = "JournalEntry.j.JournalEntryPage.target";
  const permission = (observable = true, owner = false) => (_user, level) => level === "OWNER" ? owner : observable;
  const journal = { name: "Journal", testUserPermission: permission(), pages: [] };
  const target = { uuid, id: "target", name: "target", documentName: "JournalEntryPage", parent: journal, testUserPermission: permission() };
  const page = (id, content, observable = true, owner = false) => ({
    id, uuid: `JournalEntry.j.JournalEntryPage.${id}`, name: id, documentName: "JournalEntryPage",
    parent: journal, type: "text", text: { content }, testUserPermission: permission(observable, owner)
  });
  journal.pages = [
    target,
    page("visible", `<a data-uuid="${uuid}">link</a>`),
    page("hidden", `@UUID[${uuid}]`, false),
    page("secret", `<section class="secret">@UUID[${uuid}]</section>`),
    page("plain", `not a link: ${uuid}`),
    page("heading", `@UUID[${uuid}#heading]{Heading}`),
    page("embedded", `@Embed[uuid=${uuid} inline]`),
    page("relative", "@UUID[.JournalEntryPage.target]")
  ];
  const actor = { name: "Actor", uuid: "Actor.a", system: { notes: `@UUID[${uuid}]` },
    testUserPermission: permission(), items: [] };
  const item = { name: "Item", uuid: "Actor.a.Item.i", parent: actor, system: { description: `@UUID[${uuid}]{Note}` },
    testUserPermission: permission() };
  actor.items.push(item);
  const inaccessibleActor = { name: "Hidden actor", uuid: "Actor.hidden", system: { notes: `@UUID[${uuid}]` },
    testUserPermission: permission(false), items: [] };
  const worldItem = { name: "World item", uuid: "Item.i", system: { description: `@UUID[${uuid}]` },
    testUserPermission: permission() };
  journal.flags = { ouw25: { actorUuid: actor.uuid, tableKey: "cargo" } };
  assert.deepEqual(journalIndexForActor(actor, user, [journal]).map(entry => entry.name),
    ["target", "visible", "secret", "plain", "heading", "embedded", "relative"]);
  assert.deepEqual(journalIndexForActor({ uuid: "Actor.other" }, user, [journal]), []);
  globalThis.game = { journal: [journal], actors: [actor, inaccessibleActor], items: [worldItem] };
  globalThis.fromUuid = async id => id === ".JournalEntryPage.target" ? target
    : [target, ...journal.pages, actor, item, worldItem].find(doc => doc.uuid === id);
  globalThis.foundry = { applications: { ux: { TextEditor: { async enrichHTML(html, options) {
    return options.secrets ? html : html.replace(/<section class="secret">.*?<\/section>/g, "");
  } } } } };
  globalThis.document = { createElement: () => ({
    set innerHTML(html) {
      this.content = {
        textContent: html.replace(/<[^>]*>/g, ""),
        querySelectorAll: () => [...html.matchAll(/data-uuid="([^"]+)"/g)].map(match => ({ dataset: { uuid: match[1] } }))
      };
    }
  }) };
  const record = { flags: { ouw25: { journalPageUuid: uuid } } };
  assert.deepEqual((await findJournalBacklinks(record, user)).map(link => link.name),
    ["Journal — visible", "Journal — heading", "Journal — embedded", "Journal — relative", "Actor", "Actor — Item", "World item"]);
  journal.pages[3].testUserPermission = permission(true, true);
  assert.ok((await findJournalBacklinks(record, user)).some(link => link.name === "Journal — secret"));
  target.testUserPermission = permission(false);
  assert.deepEqual(await findJournalBacklinks(record, user), []);
  let opened = false;
  item.sheet = { render: () => { opened = true; } };
  item.testUserPermission = permission(false);
  await openJournalBacklink(item.uuid, user);
  assert.equal(opened, false);
  item.testUserPermission = permission();
  await openJournalBacklink(item.uuid, user);
  assert.equal(opened, true);
});

test("extended notes create journals lazily, recover links, and copy moved records only on request", async () => {
  const { openRecordJournal, copyPageOwnership, journalPresentation, clearDeletedJournalLinks } = await import(new URL("module/record-journal.mjs", dist));
  assert.deepEqual(copyPageOwnership({
    ownership: { default: -1 }, parent: { ownership: { default: 0 }, getUserLevel: user => user.id === "owner" ? 3 : 1 },
    getUserLevel: user => user.id === "owner" ? 3 : 0
  }, { ownership: { default: 2 }, getUserLevel: () => 3 }, [{ id: "owner" }, { id: "reader" }]),
  { default: 0, owner: 3, reader: 0 });
  const journals = [];
  const pages = new Map();
  const messages = [];
  const user = { id: "owner", can: () => true };
  class Items extends Map {
    [Symbol.iterator]() { return this.values(); }
  }
  const actor = {
    uuid: "Actor.a", name: "Company", isOwner: true, ownership: { default: 0, owner: 3, reader: 2 },
    items: new Items(), flags: {},
    async setFlag(_scope, key, value) { this.flags.ouw25 = { ...this.flags.ouw25, [key]: value }; },
    async update(changes) {
      for (const key of Object.keys(changes)) delete this.flags.ouw25.journalTables[key.split("-=")[1]];
    }
  };
  let linkFails = false;
  const record = (id, type, direction) => {
    const item = {
      id, uuid: `Actor.a.Item.${id}`, parent: actor, name: id, type, system: { direction }, flags: {},
      async setFlag(_scope, key, value) {
        if (linkFails) throw new Error("link failure");
        this.flags.ouw25 = { [key]: value };
      },
      async unsetFlag(_scope, key) { delete this.flags.ouw25[key]; }
    };
    actor.items.set(id, item);
    return item;
  };
  globalThis.game = {
    user, users: [user], journal: journals,
    i18n: { localize: key => key, format: key => key }
  };
  globalThis.ui = { notifications: {
    info: value => messages.push(value), warn: value => messages.push(value), error: value => messages.push(value)
  } };
  globalThis.fromUuid = async uuid => pages.get(uuid) ?? journals.find(journal => journal.uuid === uuid);
  let journalId = 0;
  let pageId = 0;
  globalThis.foundry = { documents: { JournalEntry: { async create(data) {
    const journal = {
      ...data, id: `j${journalId}`, uuid: `JournalEntry.j${journalId++}`, documentName: "JournalEntry",
      pages: [], sheet: { async render(options) { messages.push(options.pageId); } },
      testUserPermission: () => true, getUserLevel: () => 3,
      async createEmbeddedDocuments(_type, [data]) {
        const page = {
          ...data, id: `p${pageId}`, uuid: `JournalEntry.${this.id}.JournalEntryPage.p${pageId++}`,
          documentName: "JournalEntryPage", parent: this, _stats: { modifiedTime: 1 },
          testUserPermission: () => true, getUserLevel: () => 3,
          ownership: data.ownership ?? { default: -1 }
        };
        this.pages.push(page);
        pages.set(page.uuid, page);
        return [page];
      }
    };
    journals.push(journal);
    return journal;
  } } } };

  const first = record("first", "debt", "payable");
  assert.equal(journals.length, 0);
  await openRecordJournal(actor, first, true);
  assert.equal(journals.length, 1);
  assert.deepEqual(journals[0].ownership, actor.ownership);
  assert.equal(journals[0].pages.length, 1);
  await openRecordJournal(actor, first, true);
  assert.equal(journals[0].pages.length, 1);
  const second = record("second", "debt", "payable");
  linkFails = true;
  const originalError = console.error;
  try {
    console.error = () => {};
    await openRecordJournal(actor, second, true);
  } finally { console.error = originalError; }
  assert.equal(journals[0].pages.length, 2);
  linkFails = false;
  await openRecordJournal(actor, second, true);
  assert.equal(journals[0].pages.length, 2);
  assert.ok(second.flags.ouw25.journalPageUuid);
  const third = record("third", "debt", "payable");
  actor.flags.ouw25.journalTables["debt-payable"] = "JournalEntry.inaccessible";
  await openRecordJournal(actor, third, true);
  assert.equal(journals.length, 1);
  assert.equal(journals[0].pages.length, 2);
  actor.flags.ouw25.journalTables["debt-payable"] = journals[0].uuid;

  const original = pages.get(first.flags.ouw25.journalPageUuid);
  original.text.content = "<p>Existing note</p>";
  first.system.direction = "receivable";
  await openRecordJournal(actor, first, true);
  assert.equal(journals.length, 1);
  await openRecordJournal(actor, first, true, true);
  assert.equal(journals.length, 2);
  assert.equal(journals[1].pages[0].text.content, "<p>Existing note</p>");
  assert.equal(journals[0].pages[0], original);
  assert.equal(first.flags.ouw25.journalPageUuid, journals[1].pages[0].uuid);
  const copied = journals[1].pages[0];
  let enrichOptions;
  foundry.applications = { ux: { TextEditor: { async enrichHTML(_content, options) {
    enrichOptions = options;
    return "Visible note";
  } } } };
  globalThis.document = { createElement: () => ({
    set innerHTML(value) { this.content = { textContent: value }; }
  }) };
  copied.testUserPermission = (_user, level) => level === "OBSERVER";
  assert.deepEqual(await journalPresentation(first, user), { available: true, preview: "Visible note", needsCopy: false });
  assert.equal(enrichOptions.secrets, false);
  copied.testUserPermission = () => false;
  assert.deepEqual(await journalPresentation(first, user), { unavailable: true });
  assert.equal(first.flags.ouw25.journalPageUuid, copied.uuid);

  pages.delete(copied.uuid);
  journals[1].pages.splice(0, 1);
  await clearDeletedJournalLinks(copied, false, [actor]);
  assert.equal(first.flags.ouw25.journalPageUuid, undefined);
  assert.equal(journals[1].pages.length, 0);
  await openRecordJournal(actor, first, true);
  assert.equal(journals[1].pages.length, 1);
  assert.notEqual(first.flags.ouw25.journalPageUuid, copied.uuid);

  const deletedJournal = journals.pop();
  for (const page of deletedJournal.pages) pages.delete(page.uuid);
  await clearDeletedJournalLinks(deletedJournal, true, [actor]);
  assert.equal(first.flags.ouw25.journalPageUuid, undefined);
  assert.equal(actor.flags.ouw25.journalTables["debt-receivable"], undefined);
  assert.equal(journals.length, 1);
  await openRecordJournal(actor, first, true);
  assert.equal(journals.length, 2);
  assert.notEqual(journals[1].uuid, deletedJournal.uuid);
  assert.equal(journals[1].pages.length, 1);

  const otherActor = {
    uuid: "Actor.b", name: "Other", isOwner: true, ownership: actor.ownership,
    items: new Items(), flags: {},
    async setFlag(_scope, key, value) { this.flags.ouw25 = { ...this.flags.ouw25, [key]: value }; }
  };
  const moved = { ...first, uuid: "Actor.b.Item.first", parent: otherActor, flags: structuredClone(first.flags) };
  otherActor.items.set(moved.id, moved);
  assert.equal((await journalPresentation(moved, user)).needsCopy, true);
  await openRecordJournal(otherActor, moved, true);
  assert.equal(journals.length, 2);
  await openRecordJournal(otherActor, moved, true, true);
  assert.equal(journals.length, 3);
  assert.equal(journals[2].flags.ouw25.actorUuid, otherActor.uuid);
  assert.equal(journals[2].pages.length, 1);
  assert.equal(journals[1].pages.length, 1);
});

test("deleting a journal page or journal clears only its links so notes can be recreated", async () => {
  const { clearDeletedJournalLinks } = await import(new URL("module/record-journal.mjs", dist));
  const item = uuid => ({
    flags: { ouw25: { journalPageUuid: uuid } },
    async unsetFlag(scope, key) {
      assert.equal(scope, "ouw25");
      delete this.flags.ouw25[key];
    }
  });
  const first = item("JournalEntry.a.JournalEntryPage.one");
  const second = item("JournalEntry.a.JournalEntryPage.two");
  const other = item("JournalEntry.b.JournalEntryPage.three");
  const hidden = item("JournalEntry.a.JournalEntryPage.one");
  const actor = {
    isOwner: true, items: [first, second, other],
    flags: { ouw25: { journalTables: { cargo: "JournalEntry.a", port: "JournalEntry.b" } } },
    async update(changes) {
      for (const key of Object.keys(changes)) {
        delete this.flags.ouw25.journalTables[key.split("-=")[1]];
      }
    }
  };
  const notOwner = { isOwner: false, items: [hidden] };
  await clearDeletedJournalLinks({ uuid: "JournalEntry.a.JournalEntryPage.one" }, false, [actor, notOwner]);
  assert.equal(first.flags.ouw25.journalPageUuid, undefined);
  assert.equal(second.flags.ouw25.journalPageUuid, "JournalEntry.a.JournalEntryPage.two");
  assert.ok(hidden.flags.ouw25.journalPageUuid);
  assert.equal(actor.flags.ouw25.journalTables.cargo, "JournalEntry.a");
  await clearDeletedJournalLinks({ uuid: "JournalEntry.a" }, true, [actor, notOwner]);
  assert.equal(second.flags.ouw25.journalPageUuid, undefined);
  assert.equal(other.flags.ouw25.journalPageUuid, "JournalEntry.b.JournalEntryPage.three");
  assert.deepEqual(actor.flags.ouw25.journalTables, { port: "JournalEntry.b" });
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

test("the built styles reference the packaged paper background", async () => {
  const styles = await readFile(new URL("styles/ouw25.css", dist), "utf8");
  const background = await readFile(new URL("styles/images/sheet_bgr.webp", dist));
  assert.match(styles, /background-image: url\("\.\/images\/sheet_bgr\.webp"\)/);
  assert.equal(background.subarray(8, 12).toString(), "WEBP");
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

test("bargain prices, advantage allocation, and mixed payments follow the selected rules", async () => {
  const { calculateBargain } = await import(new URL("module/bargain.mjs", dist));
  const input = { complications: 2, advantages: 5, traits: 2, captainTraits: 3 };
  const standard = calculateBargain(input);
  assert.equal(standard.neutralized, 1);
  assert.equal(standard.spentAdvantages, 4);
  assert.equal(standard.remainingAdvantages, 1);
  assert.equal(standard.fullPrice, 4);
  assert.equal(calculateBargain({ ...input, partial: true }).price, 3);
  assert.equal(calculateBargain({ ...input, inflation: true }).fullPrice, 3);
  assert.equal(calculateBargain({ ...input, inflation: true, partial: true }).price, 1);
  const paid = calculateBargain({ ...input, advantages: 12, inflation: true, cash: 2000, budget: 4000,
    loan: 15000, time: 1, unrest: 1, enemies: 1, friends: 1 });
  assert.deepEqual(paid.contributions, { advantages: 0, time: 1, unrest: 1, money: 1, loan: 1, enemies: 3, friends: 4 });
  assert.equal(paid.remaining, 0);
  assert.ok(paid.excess > 0);
  assert.equal(calculateBargain({ advantages: 12, inflation: true }).contributions.advantages, 1);
  for (const invalid of [{ advantages: -1 }, { time: "1.5" }, { cash: 1 }, { loan: 1 }, { friends: Number.MAX_SAFE_INTEGER }]) {
    assert.throws(() => calculateBargain(invalid), RangeError);
  }
});

test("bargain money only pays for whole points, split proportionally with exact integer rounding", async () => {
  const { calculateBargain } = await import(new URL("module/bargain.mjs", dist));
  for (const [cash, budget, expected] of [
    [0, 0, { cash: 0, budget: 0, unspent: 0 }],
    [500, 0, { cash: 0, budget: 0, unspent: 500 }],
    [6100, 0, { cash: 6000, budget: 0, unspent: 100 }],
    [0, 6100, { cash: 0, budget: 6000, unspent: 100 }],
    [4000, 2500, { cash: 3692, budget: 2308, unspent: 500 }]
  ]) {
    assert.deepEqual(calculateBargain({ traits: 2, cash, budget }).moneyPayment, expected);
  }
  const maximum = Number.MAX_SAFE_INTEGER;
  const result = calculateBargain({ traits: 1, cash: maximum - 1000, budget: 1000 });
  assert.equal(result.moneyPayment.cash + result.moneyPayment.budget + result.moneyPayment.unspent, maximum);
  assert.ok(result.moneyPayment.budget <= 1000);
});

test("bargain payment batches only confirmed funds and rejects stale or unauthorized balances", async () => {
  const { applyPayment, validatePayment } = await import(new URL("module/bargain-dialog.mjs", dist));
  const previousGame = globalThis.game;
  const previousFoundry = globalThis.foundry;
  const actor = { id: "a", documentName: "Actor", type: "merchant", system: { pocketMoney: 5000 },
    testUserPermission: () => true };
  const cooperative = { id: "b", documentName: "Actor", type: "cooperative", system: { budget: 8000, unrest: 9 },
    testUserPermission: () => true };
  const actors = new Map([[actor.id, actor], [cooperative.id, cooperative]]);
  let batches = [];
  globalThis.game = { actors, user: {} };
  globalThis.foundry = { documents: { Actor: { async updateDocuments(updates) {
    batches.push(updates);
    for (const update of updates) {
      const target = actors.get(update._id);
      if ("system.pocketMoney" in update) target.system.pocketMoney = update["system.pocketMoney"];
      if ("system.budget" in update) target.system.budget = update["system.budget"];
      if ("system.unrest" in update) target.system.unrest = update["system.unrest"];
    }
  } } } };
  try {
    const snapshot = { cash: 5000, budget: 8000, unrest: 9 };
    const values = { cash: 2000, budget: 4000, unrest: 2, traits: 2 };
    assert.equal(validatePayment(actor, cooperative, values, snapshot), true);
    assert.equal(validatePayment(actor, cooperative, { ...values, unrest: 3 }, snapshot), false);
    assert.equal(validatePayment(actor, null, { cash: 0, budget: 0, unrest: 1 }, snapshot), false);
    cooperative.system.unrest = 10;
    assert.equal(validatePayment(actor, cooperative, values, snapshot), false);
    cooperative.system.unrest = 9;
    await applyPayment(actor, cooperative, values, snapshot);
    assert.deepEqual(batches, [[{ _id: "a", "system.pocketMoney": 3000 }, { _id: "b", "system.budget": 4000, "system.unrest": 25 }]]);
    assert.equal(validatePayment(actor, cooperative, values, snapshot), false);
    await assert.rejects(applyPayment(actor, cooperative, values, snapshot));
    cooperative.testUserPermission = () => false;
    assert.equal(validatePayment(actor, cooperative, values, { cash: 3000, budget: 4000 }), false);
    cooperative.testUserPermission = () => true;
    foundry.documents.Actor.updateDocuments = async updates => {
      actor.system.pocketMoney = updates[0]["system.pocketMoney"];
    };
    await assert.rejects(applyPayment(actor, cooperative, { cash: 3000, budget: 3000, traits: 2 }, { cash: 3000, budget: 4000 }), /Partial payment/);
    assert.equal(actor.system.pocketMoney, 0);
    assert.equal(cooperative.system.budget, 4000);
  } finally {
    globalThis.game = previousGame;
    globalThis.foundry = previousFoundry;
  }
});

test("bargain confirmation leaves fractional payment amounts in their original accounts", async () => {
  const { applyPayment } = await import(new URL("module/bargain-dialog.mjs", dist));
  const previous = { game: globalThis.game, foundry: globalThis.foundry };
  const actor = { id: "a", documentName: "Actor", type: "merchant", system: { pocketMoney: 5000 }, testUserPermission: () => true };
  const cooperative = { id: "b", documentName: "Actor", type: "cooperative", system: { budget: 8000 }, testUserPermission: () => true };
  const actors = new Map([[actor.id, actor], [cooperative.id, cooperative]]);
  let updates = [];
  globalThis.game = { actors, user: {} };
  globalThis.foundry = { documents: { Actor: { async updateDocuments(batch) {
    updates.push(batch);
    for (const entry of batch) {
      if ("system.pocketMoney" in entry) actor.system.pocketMoney = entry["system.pocketMoney"];
      if ("system.budget" in entry) cooperative.system.budget = entry["system.budget"];
    }
  } } } };
  try {
    const snapshot = { cash: 5000, budget: 8000 };
    assert.deepEqual(await applyPayment(actor, cooperative, { cash: 500, budget: 400, traits: 2 }, snapshot),
      { cash: 0, budget: 0, unspent: 900 });
    assert.deepEqual(updates, []);
    assert.deepEqual(await applyPayment(actor, cooperative, { cash: 4000, budget: 2500, traits: 2 }, snapshot),
      { cash: 3692, budget: 2308, unspent: 500 });
    assert.equal(actor.system.pocketMoney, 1308);
    assert.equal(cooperative.system.budget, 5692);
  } finally {
    globalThis.game = previous.game;
    globalThis.foundry = previous.foundry;
  }
});

test("bargain contacts and default cooperative selection respect permissions and duplicates", async () => {
  const { firstFounderCooperative, contactCooperative, recordBargainContact } = await import(new URL("module/bargain-dialog.mjs", dist));
  const previous = globalThis.game;
  const leader = { uuid: "Actor.leader" };
  const makeCooperative = (id, founders = [], owner = true) => ({
    id, name: id, documentName: "Actor", type: "cooperative", system: { founders }, items: [],
    testUserPermission: () => owner,
    async createEmbeddedDocuments(type, entries) {
      assert.equal(type, "Item");
      this.items.push(...entries);
      return entries;
    }
  });
  const selected = makeCooperative("selected");
  const founded = makeCooperative("founded", [leader.uuid]);
  const other = makeCooperative("other", [leader.uuid]);
  const actors = new Map([selected, founded].map(actor => [actor.id, actor]));
  globalThis.game = { actors, user: {}, i18n: { localize: () => "was challenged" } };
  try {
    assert.equal(contactCooperative(selected, leader), selected);
    assert.equal(contactCooperative(null, leader), founded);
    assert.equal(firstFounderCooperative(leader), founded);
    actors.set(other.id, other);
    assert.equal(firstFounderCooperative(leader), founded);
    founded.testUserPermission = (_user, permission) => permission === "OBSERVER";
    assert.equal(firstFounderCooperative(leader), founded);
    assert.equal(contactCooperative(founded, leader), null);
    founded.testUserPermission = () => true;
    assert.equal(contactCooperative(null, leader), null);
    actors.delete(other.id);
    await recordBargainContact(founded, "Opponent");
    assert.deepEqual(founded.items, [{ type: "contact", name: "Opponent", system: { location: "", amount: 0, reason: "was challenged" } }]);
    await recordBargainContact(founded, " opponent ");
    assert.equal(founded.items.length, 1);
    founded.testUserPermission = () => false;
    assert.equal(contactCooperative(null, leader), null);
    await assert.rejects(recordBargainContact(founded, "Another"), /permission/);
  } finally {
    globalThis.game = previous;
  }
});

test("bargain records validate permissions and preserve or create the leader's debt and enemies", async () => {
  const { validateBargainRecords, recordBargainConsequences } = await import(new URL("module/bargain-dialog.mjs", dist));
  const previous = globalThis.game;
  const debt = { id: "debt", name: "Creditor", type: "debt", system: { direction: "payable", amount: 100, location: "Old" } };
  const items = Object.assign([debt], { get(id) { return this.find(item => item.id === id); } });
  const leader = { id: "leader", documentName: "Actor", type: "merchant", items, testUserPermission: () => true,
    async updateEmbeddedDocuments(_type, updates) {
      debt.system.amount = updates[0]["system.amount"];
      debt.system.location = updates[0]["system.location"];
      return [debt];
    },
    async createEmbeddedDocuments(_type, records) { items.push(...records); return records; }
  };
  globalThis.game = { actors: new Map([[leader.id, leader]]), user: {} };
  const values = { loan: "300", existingDebt: "debt", debtAmount: "100", debtLocation: "Old", debtName: "Creditor", creditorName: "",
    creditorLocation: "Глокрр", enemies: "2", enemyRecords: [
      { name: "First", location: "Глокрр" }, { name: "Second", location: "" }
    ] };
  try {
    assert.equal(validateBargainRecords(leader, values), true);
    debt.system.location = "Changed";
    assert.equal(validateBargainRecords(leader, values), false);
    debt.system.location = "Old";
    debt.name = "Renamed";
    assert.equal(validateBargainRecords(leader, values), false);
    debt.name = "Creditor";
    debt.system.amount = Number.MAX_SAFE_INTEGER;
    assert.equal(validateBargainRecords(leader, { ...values, debtAmount: String(Number.MAX_SAFE_INTEGER) }), false);
    debt.system.amount = 100;
    await recordBargainConsequences(leader, values);
    assert.deepEqual(debt.system, { direction: "payable", amount: 400, location: "Глокрр" });
    assert.deepEqual(items.slice(1).map(item => [item.name, item.system.direction, item.system.location]),
      [["First", "enemy", "Глокрр"], ["Second", "enemy", ""]]);
    assert.equal(validateBargainRecords(leader, values), false);
    const newDebt = { ...values, loan: "500", existingDebt: "", creditorName: "New creditor", enemies: "0", enemyRecords: [] };
    await recordBargainConsequences(leader, newDebt);
    assert.deepEqual(items[3], { type: "debt", name: "New creditor",
      system: { direction: "payable", amount: 500, location: "Глокрр" } });
    assert.equal(validateBargainRecords(leader, { ...newDebt, creditorName: "" }), false);
    assert.equal(validateBargainRecords(leader, { ...newDebt, enemies: "21", enemyRecords: Array(21).fill({ name: "Enemy" }) }), false);
    assert.equal(validateBargainRecords(leader, { ...newDebt, enemies: "20", enemyRecords: Array(20).fill({ name: "Enemy" }) }), true);
    assert.equal(validateBargainRecords(leader, { ...newDebt, enemies: "1", enemyRecords: [{ name: "" }] }), false);
    leader.testUserPermission = () => false;
    await assert.rejects(recordBargainConsequences(leader, newDebt), /changed/);
  } finally {
    globalThis.game = previous;
  }
});

test("lost bargain friends are removed only while they are still selected, owned friends", async () => {
  const { validateBargainFriends, removeBargainFriends } = await import(new URL("module/bargain-dialog.mjs", dist));
  const previous = globalThis.game;
  const items = Object.assign([
    { id: "f1", type: "relationship", system: { direction: "friend" } },
    { id: "f2", type: "relationship", system: { direction: "friend" } },
    { id: "enemy", type: "relationship", system: { direction: "enemy" } }
  ], { get(id) { return this.find(item => item.id === id); } });
  let allowed = true, calls = 0;
  const actor = { id: "initiator", documentName: "Actor", type: "merchant", items,
    testUserPermission: (_user, permission) => permission !== "OWNER" || allowed,
    async deleteEmbeddedDocuments(type, ids) {
      calls++;
      assert.equal(type, "Item");
      return ids.map(id => items.splice(items.findIndex(item => item.id === id), 1)[0]);
    }
  };
  const shown = [{ id: "f1", name: "One" }, { id: "f2", name: "Two" }];
  globalThis.game = { actors: new Map([[actor.id, actor]]), user: {} };
  try {
    assert.equal(validateBargainFriends(actor, ["f1", "f1"], shown), false);
    assert.equal(validateBargainFriends(actor, ["enemy"], shown), false);
    allowed = false;
    await assert.rejects(removeBargainFriends(actor, ["f1"], shown), /changed/);
    allowed = true;
    items.get("f1").system.direction = "enemy";
    await assert.rejects(removeBargainFriends(actor, ["f1"], shown), /changed/);
    items.get("f1").system.direction = "friend";
    assert.equal(calls, 0);
    await removeBargainFriends(actor, [], shown);
    assert.equal(calls, 0);
    await removeBargainFriends(actor, ["f1"], shown);
    assert.equal(items.get("f1"), undefined);
    assert.equal(items.get("f2").system.direction, "friend");
    assert.equal(items.get("enemy").system.direction, "enemy");
    assert.equal(validateBargainFriends(actor, ["f1"], shown), false);
    actor.deleteEmbeddedDocuments = async () => [];
    await assert.rejects(removeBargainFriends(actor, ["f2"], shown), /removal failed/);
  } finally {
    globalThis.game = previous;
  }
});

test("bargain locations combine the 31 Union trading ports with known places without aliases", async () => {
  const { UNION_TRADE_PORTS, locationChoices } = await import(new URL("module/ports.mjs", dist));
  assert.equal(UNION_TRADE_PORTS.length, 31);
  const locations = locationChoices(["Глокрр", "Пенллн", "Новый причал", " новый причал "]);
  assert.equal(locations.length, 32);
  assert.equal(locations.filter(name => name === "Пэнллн").length, 1);
  assert.equal(locations.at(-1).toLowerCase(), "новый причал");
});

test("English bargain text uses ampersands", async () => {
  const { OUW25: { Bargain, BargainCalc } } = JSON.parse(await readFile(new URL("lang/en.json", dist), "utf8"));
  const { KnowOpponent, ...otherTexts } = BargainCalc;
  assert.equal(KnowOpponent, "... and now we know him? (Y/N)");
  assert.doesNotMatch(JSON.stringify({ Bargain, otherTexts }), /\band\b/i);
  assert.equal(BargainCalc.Traits, "Leader's merits & flaws");
  assert.equal(BargainCalc.CaptainTraits, "Cap'n merits & flaws");
  assert.equal(BargainCalc.Time, "Time for prep (oct.)");
  assert.equal(BargainCalc.Unrest, "Payment in unrest (pts.)");
  assert.equal(BargainCalc.Budget, "From coop. budget (og.)");
  assert.equal(BargainCalc.NoFriends, "There still no friends in your collection...");
  assert.equal(BargainCalc.NoNewEnemies, "Still no enemies here... Want some?");
  assert.equal(BargainCalc.SuccessCost, "Success cost: {full} pts.");
  assert.equal(BargainCalc.PriceSummary, "Complications cancelled: {neutralized}; advantages spent: {spent}, remaining: {remaining}.");
});

test("bargain dialog orders payment fields and validates contact and partial outcome choices", async () => {
  const { openBargain } = await import(new URL("module/bargain-dialog.mjs", dist));
  const previous = { game: globalThis.game, foundry: globalThis.foundry, document: globalThis.document, ui: globalThis.ui,
    getComputedStyle: globalThis.getComputedStyle, ResizeObserver: globalThis.ResizeObserver, random: Math.random };
  const actor = { id: "a", uuid: "Actor.a", name: "Merchant", documentName: "Actor", type: "merchant",
    img: "portrait.webp", prototypeToken: { texture: { src: "token.webp" } },
    system: { pocketMoney: 0 }, items: Object.assign([], { get() {} }), testUserPermission: () => true };
  const cooperative = { id: "c", uuid: "Actor.c", name: "Cooperative", documentName: "Actor", type: "cooperative",
    system: { budget: 50, unrest: 0, founders: [] }, items: [], testUserPermission: () => true };
  const partial = Object.assign(new EventTarget(), { checked: false });
  const consequence = { value: "unrest", disabled: true };
  const existingDebt = Object.assign(new EventTarget(), { value: "", selectedOptions: [], replaceChildren() {} });
  const fields = {
    partial, consequence, inflation: { checked: false }, knowOpponent: { checked: false }, goal: { value: "" }, custom: { value: "" },
    existingDebt, creditorLocation: { value: "" }, time: { value: "2" },
    cash: { value: "0" }, budget: { value: "0" }, unrest: { value: "0" },
    traits: { value: "0" }, advantages: { value: "0" }, complications: { value: "0" }, enemyDescription: { value: "" }
  };
  fields.namedItem = name => fields[name];
  let selectedFriends = [];
  const enemyName = { value: "Old enemy", focus() { this.focused = true; } };
  const enemyLocation = { value: "Old location" };
  const enemyRow = { hidden: true, querySelector: selector =>
    selector === "[data-enemy-name]" ? enemyName : enemyLocation };
  const form = Object.assign(new EventTarget(), { elements: fields, append(node) {
    if (node === elements["[data-error]"]) this.error = node;
    else this.scrollbar = node;
  },
    reset() { partial.checked = false; },
    querySelectorAll: selector => selector === 'input[name="friend"]:checked' ? selectedFriends
      : selector === "[data-enemy-row]" ? [enemyRow] : [] });
  const viewport = { append(backdrop, upperBackdrop) { form.backdrop = backdrop; form.upperBackdrop = upperBackdrop; },
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 700, height: 600 }) };
  const scrollArea = Object.assign(new EventTarget(), { clientHeight: 600, scrollHeight: 600, scrollTop: 0, offsetTop: 0,
    getBoundingClientRect: () => ({ top: 108 }) });
  const consequencesRect = { left: 150, top: 400, right: 750, bottom: 600 };
  let leader, shownCooperative;
  const elements = {
    form, "[data-leader]": { replaceChildren(child) { leader = child; } },
    "[data-cooperative]": { replaceChildren(child) { shownCooperative = child; } },
    '[data-action="ok"]': { disabled: false, childNodes: [], querySelector() { return null; }, append() {} },
    "[data-custom]": { hidden: true }, "[data-new-creditor]": {},
    "[data-helpers]": { replaceChildren() {} }, '[data-drop="helpers"] [data-drop-hint]': { hidden: false },
    "[data-no-enemies]": { setAttribute(name, value) { this[name] = value; } }, "[data-contact-target]": {},
    "[data-success-cost]": {}, "[data-price-details]": {},
    "[data-add-enemy]": new EventTarget(),
    "[data-enemy-row]": enemyRow,
    "[data-price-icon]": { setAttribute(name, value) { this[name] = value; } },
    "[data-summary]": {}, "[data-breakdown-total]": {}, "[data-breakdown-details]": {}, "[data-error]": {
      "aria-hidden": "true", textContent: "",
      setAttribute(name, value) { this[name] = value; }, getAttribute(name) { return this[name]; }
    },
    ".dialog-content": scrollArea, ".window-content": viewport, "[data-bargain]": { offsetHeight: 700 },
    ".ouw25-bargain-consequences": { getBoundingClientRect: () => consequencesRect }
  };
  const badges = ["loan", "enemies", "friends"].map(kind => ({
    dataset: { points: kind }, setAttribute(name, value) { this[name] = value; }
  }));
  const root = { id: "test", offsetHeight: 800, style: { setProperty(name, value) { this[name] = value; } },
    querySelector: selector => elements[selector],
    querySelectorAll: selector => selector === "[data-points]" ? badges : selector === "[data-enemy-row]" ? [enemyRow] : [] };
  globalThis.getComputedStyle = () => ({ paddingTop: "8px", paddingBottom: "8px" });
  globalThis.document = { createElement: () => Object.assign(new EventTarget(), {
    dataset: {}, style: {}, children: [], append(...children) { this.children.push(...children); },
    setAttribute(name, value) { this[name] = value; }, remove() { this.removed = true; }
  }) };
  const observers = [];
  globalThis.ResizeObserver = class {
    constructor() { observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  const formatted = new Map();
  globalThis.game = {
    actors: new Map([[actor.id, actor]]), user: {},
    i18n: { localize: key => key, format: (key, values) => { formatted.set(key, values); return key; } }
  };
  let warning, incomingDraftTest = false;
  globalThis.ui = { notifications: { warn: value => { warning = value; } } };
  globalThis.foundry = { applications: {
    handlebars: { renderTemplate: async (_path, data) => {
      assert.deepEqual(data.paymentFields.map(field => field.name),
        ["traits", "captainTraits", "unrest", "time", "cash", "budget"]);
      return "";
    } },
    api: { DialogV2: { input: async config => {
      assert.equal(config.position.height, 800);
      let positions = 0;
      const dialog = { element: root, setPosition() { positions++; } };
      config.render(null, dialog);
      if (incomingDraftTest) {
        assert.equal(fields.goal.value, "Transferred goal");
        assert.equal(fields.enemyDescription.value, "Rival");
        assert.equal(fields.advantages.value, "3");
        assert.equal(fields.complications.value, "2");
        assert.equal(fields.knowOpponent.checked, true);
        assert.equal(shownCooperative.children[1].textContent, "Cooperative");
        assert.equal(fields.budget.disabled, false);
        return null;
      }
      assert.equal(root.style["--ouw25-bargain-min-height"], "916px");
      assert.equal(positions, 1);
      assert.equal(leader.children[0].src, "token.webp");
      assert.equal(fields.budget.disabled, true);
      assert.equal(fields.unrest.disabled, true);
      assert.equal(elements["[data-no-enemies]"]["aria-hidden"], "false");
      assert.deepEqual(badges.map(badge => badge.textContent), [0, 0, 0]);
      assert.equal(elements["[data-price-icon]"].textContent, "🟢");
      assert.deepEqual(formatted.get("OUW25.BargainCalc.SuccessCost"), { full: 2 });
      assert.deepEqual(formatted.get("OUW25.BargainCalc.PriceSummary"), { neutralized: 0, spent: 0, remaining: 0 });
      assert.deepEqual(formatted.get("OUW25.BargainCalc.BreakdownTotal"), { sum: formatted.get("OUW25.BargainCalc.PaymentSummary").paid });
      fields.enemies = { value: "0" };
      elements["[data-add-enemy]"].dispatchEvent(new Event("click"));
      assert.equal(fields.enemies.value, "1");
      assert.equal(enemyRow.hidden, false);
      assert.equal(enemyName.value, "");
      assert.equal(enemyLocation.value, "");
      assert.equal(enemyName.focused, true);
      assert.equal(elements["[data-add-enemy]"].disabled, true);
      assert.equal(elements["[data-no-enemies]"]["aria-hidden"], "true");
      assert.equal(badges[1].textContent, 3);
      assert.equal(elements['[data-action="ok"]'].disabled, true);
      elements["[data-add-enemy]"].dispatchEvent(new Event("click"));
      assert.equal(fields.enemies.value, "1");
      fields.enemies.value = "0";
      form.dispatchEvent(new Event("input"));
      assert.equal(elements["[data-add-enemy]"].disabled, false);
      assert.equal(form.scrollbar.hidden, true);
      assert.deepEqual(form.backdrop.style, { left: "-30px", top: "280px", width: "760px", height: "370px" });
      assert.equal(form.upperBackdrop.style.top, "-22px");
      consequencesRect.top = 350;
      consequencesRect.bottom = 750;
      scrollArea.dispatchEvent(new Event("scroll"));
      assert.equal(form.backdrop.style.top, "230px");
      assert.equal(form.backdrop.style.height, "570px");
      consequencesRect.top = 400;
      consequencesRect.bottom = 600;
      for (const name of ["traits", "captainTraits", "time", "unrest", "cash", "budget", "loan", "enemies", "advantages", "complications"]) {
        const original = fields[name];
        fields[name] = { value: "", validity: { badInput: false } };
        form.dispatchEvent(new Event("input"));
        assert.equal(elements["[data-success-cost]"].textContent, "OUW25.BargainCalc.SuccessCost", name);
        assert.equal(elements["[data-price-details]"].textContent, "OUW25.BargainCalc.PriceSummary", name);
        assert.equal(elements["[data-summary]"].textContent, "OUW25.BargainCalc.PaymentSummary", name);
        assert.equal(elements["[data-breakdown-total]"].textContent, "OUW25.BargainCalc.BreakdownTotal", name);
        assert.equal(elements["[data-breakdown-details]"].textContent, "OUW25.BargainCalc.Breakdown", name);
        fields[name] = original;
      }
      fields.cash.value = "";
      assert.equal(config.ok.callback(null, { form }).values.cash, "0");
      fields.cash.validity = { badInput: true };
      form.dispatchEvent(new Event("input"));
      assert.equal(form.error["aria-hidden"], "false");
      assert.equal(form.error.textContent, "OUW25.BargainCalc.Invalid");
      assert.equal(elements["[data-success-cost]"].textContent, "");
      assert.equal(elements["[data-price-details]"].textContent, "");
      assert.equal(elements["[data-breakdown-total]"].textContent, "");
      assert.equal(elements["[data-breakdown-details]"].textContent, "");
      assert.equal(config.ok.callback(null, { form }), false);
      fields.cash.value = "0";
      fields.cash.validity = { badInput: false };
      form.dispatchEvent(new Event("input"));
      assert.equal(form.error["aria-hidden"], "true");
      assert.equal(form.error.textContent, "OUW25.BargainCalc.Invalid");
      fields.cash.value = "";
      fields.cash.validity = { badInput: true };
      form.dispatchEvent(new Event("input"));
      assert.equal(form.error["aria-hidden"], "false");
      assert.equal(form.error.textContent, "OUW25.BargainCalc.Invalid");
      fields.cash.value = "0";
      fields.cash.validity = { badInput: false };
      form.dispatchEvent(new Event("input"));
      fields.time.value = "1";
      scrollArea.scrollHeight = 1200;
      form.dispatchEvent(new Event("input"));
      assert.equal(elements["[data-price-icon]"].textContent, "🟠");
      assert.equal(form.scrollbar.hidden, false);
      const down = new Event("keydown", { cancelable: true });
      down.key = "ArrowDown";
      form.scrollbar.dispatchEvent(down);
      assert.equal(scrollArea.scrollTop, 40);
      assert.equal(form.upperBackdrop.style.top, "-62px");
      assert.equal(form.scrollbar["aria-valuenow"], "40");
      fields.time.value = "2";
      form.dispatchEvent(new Event("input"));
      assert.equal(elements["[data-price-icon]"].textContent, "🟢");
      fields.enemies = { value: "1" };
      elements["[data-bargain]"].offsetHeight = 1200;
      form.dispatchEvent(new Event("input"));
      assert.equal(root.style["--ouw25-bargain-min-height"], "916px");
      assert.equal(elements["[data-no-enemies]"]["aria-hidden"], "true");
      assert.equal(badges[1].textContent, 3);
      fields.enemies.value = "0";
      fields.captainTraits = { value: "2" };
      fields.loan = { value: "10000" };
      selectedFriends = [{ value: "friend" }];
      form.dispatchEvent(new Event("input"));
      assert.equal(elements["[data-no-enemies]"]["aria-hidden"], "false");
      assert.deepEqual(badges.map(badge => badge.textContent), [1, 0, 4]);
      fields.captainTraits.value = "0";
      form.dispatchEvent(new Event("input"));
      assert.deepEqual(badges.map(badge => badge.textContent), ["—", "—", "—"]);
      assert.equal(elements["[data-price-icon]"]["aria-label"], "OUW25.BargainCalc.PriceUnavailable");
      fields.loan.value = "0";
      selectedFriends = [];
      form.dispatchEvent(new Event("input"));
      fields.knowOpponent.checked = true;
      form.dispatchEvent(new Event("change"));
      assert.equal(elements['[data-action="ok"]'].disabled, true);
      assert.equal(config.ok.callback(null, { form }), false);
      assert.equal(warning, "OUW25.BargainCalc.ContactUnavailable");
      fields.knowOpponent.checked = false;
      form.dispatchEvent(new Event("change"));
      assert.equal(consequence.disabled, true);
      assert.equal(consequence.value, "");
      Math.random = () => 0.999;
      partial.checked = true;
      partial.dispatchEvent(new Event("change"));
      form.dispatchEvent(new Event("change"));
      assert.equal(consequence.disabled, false);
      assert.equal(consequence.value, "grudge");
      consequence.value = "custom";
      form.dispatchEvent(new Event("change"));
      form.dispatchEvent(new Event("input"));
      assert.equal(consequence.value, "custom");
      assert.equal(elements["[data-custom]"].hidden, false);
      partial.checked = false;
      partial.dispatchEvent(new Event("change"));
      form.dispatchEvent(new Event("change"));
      assert.equal(consequence.disabled, true);
      assert.equal(consequence.value, "");
      assert.equal(elements["[data-custom]"].hidden, true);
      assert.equal(config.ok.callback(null, { form }).result.price, 2);
      Math.random = () => 0;
      partial.checked = true;
      partial.dispatchEvent(new Event("change"));
      form.dispatchEvent(new Event("change"));
      assert.equal(consequence.value, "damage");
      assert.equal(config.ok.callback(null, { form }).result.price, 1);
      assert.deepEqual(formatted.get("OUW25.BargainCalc.SuccessCost"), { full: 2 });
      actor.prototypeToken.texture.src = "tokens/*.webp";
      const oldScrollbar = form.scrollbar;
      const oldBackdrop = form.backdrop;
      const oldUpperBackdrop = form.upperBackdrop;
      config.render(null, dialog);
      assert.equal(oldScrollbar.removed, true);
      assert.equal(oldBackdrop.removed, true);
      assert.equal(oldUpperBackdrop.removed, true);
      assert.equal(observers[0].disconnected, true);
      assert.equal(leader.children[0].src, "portrait.webp");
      return null;
    } } }
  } };
  try {
    await openBargain(actor);
    assert.equal(form.scrollbar.removed, true);
    assert.equal(form.backdrop.removed, true);
    assert.equal(form.upperBackdrop.removed, true);
    assert.ok(observers.every(observer => observer.disconnected));
    incomingDraftTest = true;
    game.actors.set(cooperative.id, cooperative);
    await openBargain(actor, { leader: actor, cooperative, helpers: [], goal: "Transferred goal", opponent: "Rival",
      knowOpponent: true, advantages: "3", complications: "2" });
  } finally {
    globalThis.game = previous.game;
    globalThis.foundry = previous.foundry;
    globalThis.document = previous.document;
    globalThis.ui = previous.ui;
    globalThis.getComputedStyle = previous.getComputedStyle;
    globalThis.ResizeObserver = previous.ResizeObserver;
    Math.random = previous.random;
  }
});

test("the check button opens a separate dialog", async () => {
  const template = await readFile(new URL("templates/actor-notes.hbs", dist), "utf8");
  assert.match(template, /<button[^>]+ouw25-collision[^>]+data-action="rollCollision"/);
  assert.doesNotMatch(template, /<details class="ouw25-sidebar-card ouw25-collision">/);
});

test("the bargain panel opens the calculator and its reference is inside the dialog", async () => {
  const sheet = await readFile(new URL("templates/actor-notes.hbs", dist), "utf8");
  const dialog = await readFile(new URL("templates/bargain.hbs", dist), "utf8");
  assert.match(sheet, /<button type="button" class="ouw25-sidebar-card ouw25-bargain-reference" data-action="openBargain"[^>]*\{\{#unless editable\}\}disabled\{\{\/unless\}\}/);
  assert.doesNotMatch(sheet, /<details class="ouw25-sidebar-card ouw25-bargain-reference"/);
  for (const key of ["Price", "Payment", "Consequences", "Inflation"]) {
    assert.match(dialog, new RegExp(`OUW25\\.Bargain\\.${key}`));
    assert.doesNotMatch(sheet, new RegExp(`OUW25\\.Bargain\\.${key}`));
  }
  assert.match(dialog, /^<section[^>]*>\s*<div class="ouw25-bargain-toolbar">[\s\S]*?ouw25-bargain-switch[\s\S]*?ouw25-bargain-help/);
  assert.match(dialog, /name="inflation" role="switch" aria-label="\{\{localize "OUW25\.BargainCalc\.Inflation"\}\}"/);
  assert.match(dialog, /name="partial" role="switch"/);
  assert.match(dialog, /<select name="consequence"[^>]* disabled>/);
  assert.match(dialog, /<label class="ouw25-bargain-goal-field"><span>\{\{localize "OUW25\.BargainCalc\.GoalLabel"\}\}:<\/span>\s*<input type="text" name="goal"/);
  assert.match(dialog, /<label class="ouw25-bargain-goal-field"><span>\{\{localize "OUW25\.BargainCalc\.Opponent"\}\}:<\/span>\s*<input name="enemyDescription"/);
  assert.doesNotMatch(dialog, /<h4>\{\{localize "OUW25\.BargainCalc\.Goal"\}\}/);
  assert.doesNotMatch(dialog, /BargainCalc\.Initiator|data-leader-wounds|BargainCalc\.Wounds/);
});

test("collision assistant accounts for chosen sources without applying their consequences", async () => {
  const { calculateCollisionAssistant } = await import(new URL("module/collision-assistant.mjs", dist));
  assert.deepEqual(calculateCollisionAssistant({}), { diceCount: 4, deduction: 0, details: [] });
  const result = calculateCollisionAssistant({
    specialty: "1", shipMerit: "1", dream: true, preparation: "2", wounds: "1",
    donation: "359", equipment: "1", personalFlaws: "2"
  });
  assert.equal(result.diceCount, 14);
  assert.equal(result.deduction, 3);
  assert.ok(result.details.some(({ label, value }) => label.endsWith(".donation") && value === 359));
  for (const invalid of [{ specialty: 2 }, { equipment: 2 }, { preparation: -1 }, { other: "1.5" },
    { preparation: 97 }, { donation: Number.MAX_SAFE_INTEGER }]) {
    assert.throws(() => calculateCollisionAssistant(invalid), RangeError);
  }
});

test("check odds account for complications and guaranteed successes without limiting the roll", async () => {
  const { calculateCheck, checkProbabilities } = await import(new URL("module/collision.mjs", dist));
  assert.deepEqual(calculateCheck({ advantages: 2, wounds: 1, donations: 2, complications: 1, luck: 1 }),
    { diceCount: 9, deduction: 1, luck: 1, donation: 360 });
  const baseline = checkProbabilities(4, 0);
  assert.ok(Math.abs(baseline.Success - 0.13194444444444445) < 1e-10);
  assert.ok(Math.abs(baseline.Partial - 0.38580246913580246) < 1e-10);
  assert.ok(Math.abs(Object.values(baseline).reduce((a, b) => a + b) - 1) < 1e-10);
  assert.ok(Math.abs(checkProbabilities(4, 1, 1).Success - baseline.Success) < 1e-10);
  assert.ok(Math.abs(checkProbabilities(4, 5).Failure - 1) < 1e-10);
  assert.ok(Math.abs(checkProbabilities(4, 0, 2).Success - 1) < 1e-10);
  assert.equal(checkProbabilities(16, 0), null);
  assert.equal(calculateCheck({ advantages: 12 }).diceCount, 16);
  assert.throws(() => calculateCheck({ advantages: 97 }), RangeError);
  assert.throws(() => calculateCheck({ donations: 1, advantages: 96 }), RangeError);
});

test("check includes its first viewable founder cooperative even without ownership", async () => {
  const { openUnluck } = await import(new URL("module/unluck-dialog.mjs", dist));
  const previous = { game: globalThis.game, foundry: globalThis.foundry };
  const leader = { id: "leader", uuid: "Actor.leader", documentName: "Actor", type: "merchant",
    system: { past: "artist", luck: 0, pocketMoney: 0 }, testUserPermission: () => true };
  const makeCooperative = (id, owner) => ({
    id, uuid: `Actor.${id}`, documentName: "Actor", type: "cooperative",
    system: { founders: [leader.uuid], budget: 100 },
    testUserPermission: (_user, permission) => permission === "OBSERVER" || owner
  });
  const first = makeCooperative("first", false), second = makeCooperative("second", true);
  let choices;
  globalThis.game = { actors: new Map([leader, first, second].map(actor => [actor.id, actor])),
    user: {}, i18n: { localize: key => key, format: key => key } };
  globalThis.foundry = { applications: {
    handlebars: { renderTemplate: async (_path, data) => { choices = data.cooperatives; return ""; } },
    api: { DialogV2: class {
      constructor() { this.handlers = {}; }
      addEventListener(event, callback) { this.handlers[event] = callback; }
      render() { this.handlers.close(); }
    } }
  } };
  try {
    await openUnluck(leader);
    assert.ok(choices.includes(first));
    assert.ok(choices.includes(second));
  } finally {
    globalThis.game = previous.game;
    globalThis.foundry = previous.foundry;
  }
});

test("check luck decorations persist across updates and follow the selected count", async () => {
  const { renderLuckMarks } = await import(new URL("module/unluck-dialog.mjs", dist));
  const previous = globalThis.document;
  const marks = {
    children: [], empty: false,
    append(mark) { this.children.push(mark); },
    get lastElementChild() { return this.children.at(-1); },
    classList: { toggle(_name, empty) { marks.empty = empty; } }
  };
  globalThis.document = { createElement: () => ({
    style: { values: {}, setProperty(key, value) { this.values[key] = value; } },
    remove() { marks.children.splice(marks.children.indexOf(this), 1); }
  }) };
  try {
    renderLuckMarks(marks, 0);
    assert.equal(marks.children.length, 1);
    assert.equal(marks.empty, true);
    const first = marks.children[0];
    renderLuckMarks(marks, 1);
    assert.equal(marks.children[0], first);
    assert.equal(marks.empty, false);
    renderLuckMarks(marks, 3);
    const second = marks.children[1], third = marks.children[2];
    for (const mark of [second, third]) {
      const x = parseFloat(mark.style.values["--luck-x"]), y = parseFloat(mark.style.values["--luck-y"]);
      assert.ok(Math.hypot(x, y) >= 19.999999 && Math.hypot(x, y) <= 30.000001);
    }
    renderLuckMarks(marks, 3);
    assert.equal(marks.children[1], second);
    assert.equal(marks.children[2], third);
    renderLuckMarks(marks, 1);
    assert.deepEqual(marks.children, [first]);
    renderLuckMarks(marks, 0);
    assert.equal(marks.empty, true);
  } finally {
    globalThis.document = previous;
  }
});

test("check stays open for repeated rolls and clears only spent draft resources", async () => {
  const { openUnluck } = await import(new URL("module/unluck-dialog.mjs", dist));
  const oddsLabels = await Promise.all(["en", "ru"].map(async lang =>
    JSON.parse(await readFile(new URL(`lang/${lang}.json`, dist), "utf8")).OUW25.Unluck));
  const previous = { game: globalThis.game, foundry: globalThis.foundry, document: globalThis.document,
    Hooks: globalThis.Hooks, ui: globalThis.ui, ResizeObserver: globalThis.ResizeObserver };
  const actor = { id: "repeat", uuid: "Actor.repeat", name: "Merchant", documentName: "Actor", type: "merchant",
    system: { past: "artist", luck: 2, pocketMoney: 500, wound1: false, wound2: false },
    testUserPermission: () => true };
  const element = () => Object.assign(new EventTarget(), {
    children: [], dataset: {}, style: { setProperty() {} }, classList: { toggle() {} },
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    setAttribute(name, value) { this[name] = value; }
  });
  const fields = {
    goal: { value: "Goal" }, opponent: { value: "" }, knowOpponent: { checked: false },
    partial: Object.assign(new EventTarget(), { checked: false }), consequence: { value: "", disabled: true },
    custom: { value: "" }, advantages: { value: "0" }, complications: { value: "0" }, source: { value: "cash" }
  };
  fields.namedItem = name => fields[name];
  const form = Object.assign(new EventTarget(), { elements: fields, inert: false });
  let donationWidth = 220, observer;
  const selectors = {
    form, "[data-custom]": {}, "[data-luck-marks]": element(), "[data-luck-selected]": {},
    "[data-donation-amount]": {}, "[data-check-error]": {},
    '[data-action="ok"]': {}, "[data-dice-count]": { style: { values: {}, setProperty(name, value) { this.values[name] = value; } } },
    "[data-odds]": {},
    "[data-wounds]": element(), "[data-cooperative]": element(), "[data-cooperative-hint]": {},
    "[data-leader]": element(), "[data-helpers]": element(), "[data-helper-hint]": {},
    "[data-transfer-bargain]": element(), "[data-luck-minus]": element(), "[data-luck-plus]": element(),
    "[data-luck-drop]": element(), "[data-donation-minus]": element(), "[data-donation-plus]": element(),
    ".form-footer": element(), "[data-unluck-staged]": element(),
    ".ouw25-unluck-resources": {}, ".ouw25-unluck-donation": { getBoundingClientRect: () => ({ width: donationWidth }) },
    ".ouw25-unluck-status": { style: {} }
  };
  const marks = selectors["[data-luck-marks]"];
  Object.defineProperty(marks, "lastElementChild", { get() { return this.children.at(-1); } });
  const root = { isConnected: false, querySelector: selector => selectors[selector], querySelectorAll: () => [] };
  let dialog, chatCount = 0, updateCount = 0, hook, language = 0;
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observer = this; }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  globalThis.document = { createElement: element };
  globalThis.Hooks = { on: (_name, callback) => { hook = callback; return callback; }, off() {} };
  globalThis.ui = { notifications: { warn: () => assert.fail("unexpected warning"), error: () => assert.fail("unexpected error") } };
  globalThis.game = { actors: new Map([[actor.id, actor]]), user: {}, users: [{ id: "gm", isGM: true }],
    i18n: { localize: key => key, format: (label, values) => label === "OUW25.Unluck.DonationTotal" ? `${values.amount} og.`
      : label === "OUW25.Unluck.OddsValues" ? oddsLabels[language].OddsValues.replace(/\{(\w+)\}/g, (_, name) => values[name]) : label },
    settings: { get: () => "publicroll" } };
  globalThis.foundry = { applications: {
    handlebars: { renderTemplate: async () => "" },
    api: { DialogV2: class {
      constructor(options) { this.options = options; this.handlers = {}; dialog = this; }
      addEventListener(name, callback) { this.handlers[name] = callback; }
      render() { this.element = root; this.rendered = true; this.handlers.render(); }
      close() { this.rendered = false; this.handlers.close(); }
    } }
  }, dice: { Roll: class {
    async evaluate() { this.dice = [{ results: [6, 6, 2, 2].map(result => ({ active: true, result })) }]; return this; }
  } }, documents: {
    Actor: { updateDocuments: async updates => {
      updateCount++;
      for (const [key, value] of Object.entries(updates[0])) if (key.startsWith("system.")) actor.system[key.slice(7)] = value;
      hook(actor);
    } },
    ChatMessage: { getSpeaker: () => ({}), applyRollMode() {}, create: async () => { chatCount++; } }
  } };
  try {
    const open = openUnluck(actor);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(selectors[".form-footer"].children.includes(selectors["[data-unluck-staged]"]));
    assert.equal(selectors[".ouw25-unluck-status"].style.width, "220px");
    assert.equal(selectors["[data-odds]"].textContent, "48.2% / 38.6% / 13.2%");
    language = 1;
    form.dispatchEvent(new Event("input"));
    assert.equal(selectors["[data-odds]"].textContent, "48.2% / 38.6% / 13.2%");
    fields.advantages.value = "96";
    form.dispatchEvent(new Event("input"));
    assert.equal(selectors["[data-dice-count]"].textContent, 100);
    assert.equal(selectors["[data-dice-count]"].style.values["--dice-digits"], 3);
    fields.advantages.value = "0";
    form.dispatchEvent(new Event("input"));
    assert.equal(selectors["[data-dice-count]"].style.values["--dice-digits"], 1);
    assert.equal(observer.target, selectors[".ouw25-unluck-donation"]);
    assert.notEqual(observer.disconnected, true);
    donationWidth = 260;
    observer.callback();
    assert.equal(selectors[".ouw25-unluck-status"].style.width, "260px");
    const click = selector => selectors[selector].dispatchEvent(new Event("click"));
    click("[data-luck-plus]");
    click("[data-donation-plus]");
    const wound = selectors["[data-wounds]"].children[0].children[0];
    wound.checked = true;
    wound.dispatchEvent(new Event("change"));
    await dialog.options.buttons[0].callback(null, { form });
    assert.equal(dialog.rendered, true);
    assert.equal(form.inert, false);
    assert.equal(actor.system.luck, 1);
    assert.equal(actor.system.pocketMoney, 320);
    assert.equal(actor.system.wound1, true);
    assert.equal(selectors["[data-luck-selected]"].textContent, 0);
    assert.equal(selectors["[data-donation-amount]"].textContent, "0 og.");
    assert.equal(selectors["[data-dice-count]"].textContent, 4);
    assert.equal(selectors["[data-wounds]"].children[0].children[0].disabled, true);
    click("[data-luck-plus]");
    click("[data-donation-plus]");
    await dialog.options.buttons[0].callback(null, { form });
    assert.equal(actor.system.luck, 0);
    assert.equal(actor.system.pocketMoney, 140);
    assert.equal(updateCount, 2);
    assert.equal(chatCount, 2);
    assert.equal(dialog.rendered, true);
    dialog.close();
    assert.equal(observer.disconnected, true);
    await open;
  } finally {
    Object.assign(globalThis, previous);
  }
});

test("check reels show the four highest dice and mark excess surviving sixes", async () => {
  const { reelValues } = await import(new URL("module/unluck-dialog.mjs", dist));
  const dice = [2, 6, 3, 6, 5, 6, 6, 6];
  assert.deepEqual(reelValues(dice, 0), ["6", "6", "6", "6+"]);
  assert.deepEqual(reelValues(dice, 1), ["6", "6", "6", "6"]);
  assert.deepEqual(reelValues(dice, 2), ["6", "6", "6", "6"]);
  assert.deepEqual(reelValues([2, 5, 1, 4], 0), ["5", "4", "2", "1"]);
  assert.deepEqual(dice, [2, 6, 3, 6, 5, 6, 6, 6]);
});

test("change-plan hint uses the agreed success threshold", async () => {
  const { hasExcessSuccesses } = await import(new URL("module/collision.mjs", dist));
  assert.equal(hasExcessSuccesses(1, true), false);
  assert.equal(hasExcessSuccesses(2, true), true);
  assert.equal(hasExcessSuccesses(2, false), false);
  assert.equal(hasExcessSuccesses(3, false), true);
});

test("check costs reject stale resources and only record newly selected wounds", async () => {
  const { checkCostSnapshot, checkCostUpdates, applyCheckCosts } = await import(new URL("module/check-costs.mjs", dist));
  const oldGame = globalThis.game, oldFoundry = globalThis.foundry;
  const actor = { id: "leader", documentName: "Actor", type: "merchant",
    system: { past: "artist", fragile: false, luck: 2, pocketMoney: 500, wound1: true, wound2: false },
    testUserPermission: () => true };
  const coop = { id: "coop", documentName: "Actor", type: "cooperative", system: { budget: 1000 }, testUserPermission: () => true };
  globalThis.game = { actors: new Map([[actor.id, actor], [coop.id, coop]]), user: {} };
  globalThis.foundry = { documents: { Actor: { updateDocuments: async updates => {
    for (const update of updates) for (const [key, value] of Object.entries(update)) {
      if (key.startsWith("system.")) game.actors.get(update._id).system[key.slice(7)] = value;
    }
  } } } };
  try {
    const snapshot = checkCostSnapshot(actor, coop);
    const values = { luck: 1, donation: 360, source: "budget", wounds: [2] };
    assert.deepEqual(checkCostUpdates(actor, coop, snapshot, values), [
      { _id: "leader", "system.luck": 1, "system.wound2": true }, { _id: "coop", "system.budget": 640 }
    ]);
    assert.throws(() => checkCostUpdates(actor, coop, snapshot, { ...values, wounds: [1] }));
    assert.throws(() => checkCostUpdates(actor, coop, snapshot, { ...values, luck: 3 }));
    assert.throws(() => checkCostUpdates(actor, coop, snapshot, { ...values, source: "cash", donation: 540 }));
    coop.system.budget = 900;
    assert.throws(() => checkCostUpdates(actor, coop, snapshot, values));
    coop.system.budget = 1000;
    await applyCheckCosts(actor, coop, snapshot, values);
    assert.equal(actor.system.luck, 1);
    assert.equal(actor.system.wound2, true);
    assert.equal(coop.system.budget, 640);
    assert.throws(() => checkCostUpdates(actor, coop, snapshot, values));
  } finally { globalThis.game = oldGame; globalThis.foundry = oldFoundry; }
});

test("transferring a collision asks before replacing an open draft", async () => {
  const { registerCollisionWindow, transferCollision } = await import(new URL("module/collision-transfer.mjs", dist));
  const oldGame = globalThis.game, oldFoundry = globalThis.foundry;
  const actor = { uuid: "Actor.transfer" }, draft = { goal: "Escape", advantages: 2 };
  let confirmed = false, received, opened;
  globalThis.game = { i18n: { localize: key => key } };
  globalThis.foundry = { applications: { api: { DialogV2: { confirm: async () => confirmed } } } };
  const unregister = registerCollisionWindow(actor, "check", value => { received = value; });
  try {
    await transferCollision(actor, "check", draft, async () => { opened = true; });
    assert.equal(received, undefined);
    confirmed = true;
    await transferCollision(actor, "check", draft, async () => { opened = true; });
    assert.equal(received, draft);
    assert.equal(opened, undefined);
    unregister();
    await transferCollision(actor, "check", draft, async (initiator, value) => {
      assert.equal(initiator, actor); opened = value;
    });
    assert.equal(opened, draft);
  } finally { unregister(); globalThis.game = oldGame; globalThis.foundry = oldFoundry; }
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

test("hold breakdown reflects cargo, compartments, fuel and rounded provisions", async () => {
  const { shipHold } = await import(new URL("module/ship.mjs", dist));
  for (const [stock, provisions] of [[0, 0], [18, 1], [18.1, 2], [36, 2]]) {
    const hold = shipHold({ shipClass: 0, cargoLoad: 5, fuelStock: 10.5, provisionsStock: stock }, 14.75, 420);
    assert.deepEqual(hold.breakdown, { listed: 14.75, unlisted: 5, compartments: 420, fuel: 10.5, provisions });
    assert.equal(hold.occupied, 450.25 + provisions);
  }
});

test("hold warns at 100 st. free and distinguishes overload from exact capacity", async () => {
  const { shipHold } = await import(new URL("module/ship.mjs", dist));
  const ship = { shipClass: 0, cargoLoad: 1498, fuelStock: 0, provisionsStock: 18 };
  assert.equal(shipHold(ship, 0, 0).nearFull, false);
  assert.equal(shipHold(ship, 1, 0).nearFull, true);
  assert.equal(shipHold(ship, 101, 0).nearFull, true);
  assert.equal(shipHold(ship, 101, 0).overloaded, false);
  assert.equal(shipHold(ship, 101.5, 0).nearFull, false);
  assert.equal(shipHold(ship, 101.5, 0).overloaded, true);
  assert.equal(shipHold({ ...ship, shipClass: 4 }, 0, 0).capacity, 25200);
});

test("a spacious hold applies the saved bonus once and only while selected", async () => {
  const { shipHold } = await import(new URL("module/ship.mjs", dist));
  const ship = { shipClass: 0, cargoLoad: 1601, fuelStock: 0, provisionsStock: 0, holdBonus: 200 };
  assert.equal(shipHold(ship, 0, 0).overloaded, true);
  const expanded = { ...ship, merit2: "large_hold", merit4: "large_hold" };
  assert.deepEqual(shipHold(expanded, 0, 0), {
    capacity: 1800, occupied: 1601, nearFull: false, overloaded: false,
    breakdown: { listed: 0, unlisted: 1601, compartments: 0, fuel: 0, provisions: 0 }
  });
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
