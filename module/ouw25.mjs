import { parseCollisionInput, resolveCollision } from "./collision.mjs";
import { DEBT_DIRECTIONS, debtTotals, pensionBalanceAfterDeposit, pensionProgress } from "./finance.mjs";
import { lethalWoundSlot, MERCHANT_PASTS, pastFromRoll, startingPocketMoney } from "./merchant.mjs";
import { availableSpecialties, isSpecialtyAllowed, MERCHANT_SPECIALTIES, specialtyFromRoll } from "./merchant.mjs";
import { dreamFromRoll, hiringFromRoll, MERCHANT_HIRING, merchantNameFromRolls } from "./merchant.mjs";
import { COMPARTMENT_SPACE, MAX_SHIP_CLASS, MOUNT_CHOICES, SHIP_SLOT_COUNT, shipConfiguration, shipHold } from "./ship.mjs";
import {
  calculateVoyage, hasWornEngine, HOLD_BONUSES, normalizeUnrest, prepareSectorTransition, prepareUnrestIncrease, prepareVoyageReset,
  resolveForcedMode, resolvePsychotherapy, rollbackSectorTransition,
  SHIP_CLASS_STATS, SHIP_QUALITIES, SHIP_QUALITY_SLOTS, shipQualitySlots, shipSelectionError
} from "./ship.mjs";
import { SHIP_DAMAGE_SLOTS, SHIP_GEAR_CHOICES, SHIP_GEAR_SLOTS, shipCondition, shipGearSlots } from "./ship.mjs";
import { MERCHANT_TRAITS, traitFromRoll } from "./traits.mjs";
import { personalActions, personalOutcome, provisionFormula } from "./personal-actions.mjs";

const SYSTEM_ID = "ouw25";
const DEFAULT_ACTOR_IMAGE = "icons/svg/mystery-man.svg";
const DEFAULT_ACTOR_ARTWORK = {
  merchant: "systems/ouw25/styles/images/bugger_transp.webp",
  cooperative: "systems/ouw25/styles/images/ship_logo.webp"
};
const WOUND_SLOTS = [1, 2, 3, 4];
const COOPERATIVE_REPUTATIONS = ["unset", "profiteers", "hunters", "purists", "smart", "daredevils", "ordinary"];
const COOPERATIVE_MEMORIES = ["unset", "rescue", "lost_profit", "scandal", "secret", "fame", "blood"];
const RELATION_KINDS = ["friend", "enemy"];
const SHEET_TABS = {
  merchant: ["attributes", "items", "friends", "illwishers", "creditors", "notes"],
  cooperative: ["attributes", "contacts", "contracts", "ship", "cargo"]
};
const RECORD_LABELS = new Map([
  ["debt", "OUW25.Debt"],
  ["relationship", "OUW25.Relationship"],
  ["possession", "OUW25.Possession"],
  ["trait", "OUW25.Trait"],
  ["contact", "OUW25.Contact"],
  ["contract", "OUW25.Contract"],
  ["cargo", "OUW25.Cargo"]
]);
const COOPERATIVE_RECORDS = new Set(["contact", "contract", "cargo"]);
const PENDING_VOYAGE_OPERATIONS = new Set();
const VOYAGE_STATE_FIELDS = [
  "shipClass", "crewCount", "forcedMode", "illuminationMode", "unrest", "fuelStock",
  "provisionsStock", "travelSectors", "travelWatches", "lastTransition", "illuminationUnrestPending",
  "flaw1", "flaw2", "flaw3", "flaw4"
];
const VOYAGE_FORM_FIELDS = [
  "shipClass", "crewCount", "illuminationMode", "unrest",
  "fuelStock", "provisionsStock", "flaw1", "flaw2", "flaw3", "flaw4"
];
const CREATION_ROLLS = new Map([
  ["past", { key: "Past", formula: "3d6", resolve: pastFromRoll, labels: "OUW25.Past" }],
  ["specialty", { key: "Specialty", resolve: specialtyFromRoll, labels: "OUW25.Specialty", usesPast: true }],
  ["pocketMoney", { key: "Money", formula: "4d6", resolve: startingPocketMoney, usesPast: true }],
  ["dream", { key: "Dream", formula: "1d10", resolve: dreamFromRoll, labels: "OUW25.Identity.Dreams", storeLabel: true }],
  ["hiring", { key: "Hiring", formula: "1d11", resolve: hiringFromRoll, labels: "OUW25.Identity.Hiring" }],
  ["name", { key: "Name", formula: "2d15", actorName: true,
    resolve: (_total, _past, roll) => merchantNameFromRolls(...roll.dice[0].results.map(die => die.result)) }]
]);
for (const kind of Object.keys(MERCHANT_TRAITS)) {
  CREATION_ROLLS.set(kind, {
    key: "Trait", formula: "3d6", resolve: total => traitFromRoll(kind, total), labels: "OUW25.Trait.Names"
  });
}
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

class Ouw25Actor extends foundry.documents.Actor {
  static getDefaultArtwork(actorData = {}) {
    const img = Object.hasOwn(DEFAULT_ACTOR_ARTWORK, actorData.type)
      ? DEFAULT_ACTOR_ARTWORK[actorData.type] : null;
    return img ? { img, texture: { src: img } } : super.getDefaultArtwork(actorData);
  }

  static async createDialog(data = {}, createOptions = {}, dialogOptions = {}) {
    const types = Object.keys(DEFAULT_ACTOR_ARTWORK)
      .filter(type => !createOptions.types || createOptions.types.includes(type));
    if (!types.length) throw new Error("No actor types are available to create.");

    const defaultType = types.includes(data.type) ? data.type : types[0];
    const typeOptions = types.map(type => ({
      type,
      icon: this.getDefaultArtwork({ type }).img,
      label: game.i18n.localize(CONFIG.Actor.typeLabels[type]),
      selected: type === defaultType
    }));
    const content = await foundry.applications.handlebars.renderTemplate(
      `systems/${SYSTEM_ID}/templates/actor-create.hbs`,
      { name: data.name ?? "", types: typeOptions }
    );
    const title = game.i18n.format("DOCUMENT.Create", {
      type: game.i18n.localize("DOCUMENT.Actor")
    });
    const dialogConfig = {
      ...dialogOptions,
      classes: ["ouw25", ...(dialogOptions.classes ?? [])],
      window: { ...dialogOptions.window, title },
      content,
      rejectClose: false,
      ok: { icon: "fa-solid fa-check", label: title, ...dialogOptions.ok }
    };
    const result = await foundry.applications.api.DialogV2.input(dialogConfig);
    if (!result) return;

    const type = types.includes(result.type) ? result.type : defaultType;
    const name = String(result.name ?? "").trim() || game.i18n.localize(CONFIG.Actor.typeLabels[type]);
    const actorData = { ...data, name, type };
    const options = { ...createOptions, renderSheet: createOptions.renderSheet ?? true };
    delete options.types;
    return this.create(actorData, options);
  }
}

class NotesModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      notes: new foundry.data.fields.StringField({ initial: "" })
    };
  }
}

function counterField(initial = 0) {
  return new foundry.data.fields.NumberField({
    required: true, nullable: false, initial, integer: true, min: 0, max: Number.MAX_SAFE_INTEGER
  });
}

function resourceField(initial = 0) {
  return new foundry.data.fields.NumberField({
    required: true, nullable: false, initial, min: 0, max: Number.MAX_SAFE_INTEGER
  });
}

function voyageStateFingerprint(system) {
  return JSON.stringify(VOYAGE_STATE_FIELDS.map(field => system[field]));
}

function forcedModeFingerprint(system) {
  return JSON.stringify([system.forcedMode, hasWornEngine(system),
    ...SHIP_DAMAGE_SLOTS.map(number => system[`damage${number}`])]);
}

function hasUnsavedVoyageInputs(target, system) {
  const form = target.closest("form");
  if (!form) return true;
  return VOYAGE_FORM_FIELDS.some(field => {
    const input = form.elements.namedItem(`system.${field}`);
    if (!input || input.disabled) return false;
    if (input.value === "") return true;
    const value = input.type === "checkbox" ? input.checked
      : typeof system[field] === "number" ? Number(input.value) : input.value;
    return value !== system[field];
  });
}

async function publishVoyageRoll(actor, flavor, rolls, stateApplied) {
  const { ChatMessage } = foundry.documents;
  const message = {
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor,
    rolls: rolls.filter(Boolean)
  };
  ChatMessage.applyRollMode(message, game.settings.get("core", "messageMode"));
  try {
    await ChatMessage.create(message);
  } catch (error) {
    console.error(error);
    ui.notifications.error(game.i18n.localize(
      stateApplied ? "OUW25.Voyage.ChatFailedApplied" : "OUW25.Voyage.ChatFailedNotApplied"
    ));
    throw error;
  }
}

class MerchantModel extends NotesModel {
  static defineSchema() {
    const { StringField } = foundry.data.fields;
    const wounds = Object.fromEntries(WOUND_SLOTS.map(slot => [
      `wound${slot}`, new foundry.data.fields.BooleanField({ initial: false })
    ]));
    return { ...super.defineSchema(), pocketMoney: counterField(), pensionBalance: counterField(),
      luck: counterField(1),
      specialty: new foundry.data.fields.StringField({ initial: "unset", choices: MERCHANT_SPECIALTIES }),
      past: new foundry.data.fields.StringField({ initial: "unset", choices: MERCHANT_PASTS }),
      merit: new StringField({ initial: "unset", choices: ["unset", ...MERCHANT_TRAITS.merit] }),
      flaw: new StringField({ initial: "unset", choices: ["unset", ...MERCHANT_TRAITS.flaw] }),
      dream: new StringField({ initial: "" }),
      hiring: new StringField({ initial: "unset", choices: MERCHANT_HIRING }),
      fragile: new foundry.data.fields.BooleanField({ initial: false }),
      ...wounds };
  }
}

class CooperativeModel extends NotesModel {
  static migrateData(source, options) {
    if (Number.isFinite(source.unrest) && !Number.isInteger(source.unrest)) {
      Object.assign(source, normalizeUnrest(source.unrest, source.illuminationUnrestPending));
    }
    return super.migrateData(source, options);
  }

  static defineSchema() {
    const { BooleanField, NumberField, StringField } = foundry.data.fields;
    const fields = {
      ...super.defineSchema(), budget: counterField(),
      reputation: new StringField({ initial: "unset", choices: COOPERATIVE_REPUTATIONS }),
      memory: new StringField({ initial: "unset", choices: COOPERATIVE_MEMORIES }),
      shipName: new StringField({ initial: "" }),
      cargoLoad: counterField(), fuelStock: resourceField(10), provisionsStock: resourceField(10),
      holdBonus: new NumberField({
        required: true, nullable: false, initial: 0, integer: true, choices: HOLD_BONUSES
      }),
      shipClass: new NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0, max: MAX_SHIP_CLASS }),
      crewCount: counterField(10), forcedMode: new BooleanField({ initial: false }),
      illuminationMode: new BooleanField({ initial: false }),
      unrest: new NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0, max: 25 }),
      illuminationUnrestPending: new BooleanField({ initial: false }),
      travelSectors: counterField(), travelWatches: resourceField(),
      lastTransition: new StringField({ initial: "" }), travelStatus: new StringField({ initial: "" })
    };
    for (let slot = 1; slot <= SHIP_SLOT_COUNT; slot++) {
      fields[`mount${slot}`] = new StringField({ initial: slot === 1 ? "slagthrower" : "none", choices: MOUNT_CHOICES });
      fields[`compartment${slot}`] = new StringField({ initial: "none", choices: Object.keys(COMPARTMENT_SPACE) });
    }
    for (const [kind, choices] of Object.entries(SHIP_QUALITIES)) {
      for (const slot of SHIP_QUALITY_SLOTS) {
        fields[`${kind}${slot}`] = new StringField({ initial: "none", choices });
      }
      for (const slot of SHIP_GEAR_SLOTS) {
        fields[`gear${slot}`] = new StringField({ initial: "none", choices: SHIP_GEAR_CHOICES });
      }
      for (const slot of SHIP_DAMAGE_SLOTS) {
        fields[`damage${slot}`] = new BooleanField({ initial: false });
      }
    }
    return fields;
  }
}

class DebtModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { StringField } = foundry.data.fields;
    return {
      direction: new StringField({ initial: "payable", choices: DEBT_DIRECTIONS }),
      location: new StringField({ initial: "" }),
      amount: counterField()
    };
  }
}

class RelationshipModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { StringField } = foundry.data.fields;
    return {
      direction: new StringField({ initial: "friend", choices: RELATION_KINDS }),
      location: new StringField({ initial: "" }),
      reason: new StringField({ initial: "" })
    };
  }
}

class PossessionModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return { amount: counterField() };
  }
}

class ContactModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { StringField } = foundry.data.fields;
    return { location: new StringField({ initial: "" }), reason: new StringField({ initial: "" }), amount: counterField() };
  }
}

class ContractModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { StringField } = foundry.data.fields;
    return { location: new StringField({ initial: "" }), deadline: new StringField({ initial: "" }), amount: counterField() };
  }
}

class CargoModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      quantity: counterField(),
      volume: resourceField()
    };
  }
}

class TraitModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return { code: new foundry.data.fields.StringField({
      initial: MERCHANT_TRAITS.merit[0], choices: Object.values(MERCHANT_TRAITS).flat()
    }) };
  }
}

function traitChoices(kind, selected, includeUnset = false) {
  const codes = MERCHANT_TRAITS[kind];
  return (includeUnset ? ["unset", ...codes] : codes).map(value => ({
    value, selected: value === selected, label: `OUW25.Trait.Names.${value}`
  }));
}

function personalActionButtons(source, value) {
  return personalActions(source, value).map(({ id }) => ({
    id, source, value,
    caption: game.i18n.localize(`OUW25.PersonalAction.Moves.${id}.label`).split(" \u00b7 ", 1)[0]
  }));
}

class Ouw25ActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  #depositPending = false;
  #luckPending = false;
  #creationRollPending = false;
  #recordPending = false;
  #autosaveQueue = Promise.resolve();
  #invalidAutosaveFields = new Set();
  #autosaveRevisions = new Map();
  #submitRejected = false;
  #autosaveStatus = "Saved";

  static DEFAULT_OPTIONS = {
    classes: ["ouw25"],
    position: { width: 1120 },
    window: { resizable: true },
    actions: {
      rollCollision: Ouw25ActorSheet.rollCollision,
      depositPension: Ouw25ActorSheet.depositPension,
      changeLuck: Ouw25ActorSheet.changeLuck,
      editPortrait: Ouw25ActorSheet.editPortrait,
      rollCreation: Ouw25ActorSheet.rollCreation,
      rollPersonalAction: Ouw25ActorSheet.rollPersonalAction,
      editTrait: Ouw25ActorSheet.editTrait,
      editRecord: Ouw25ActorSheet.editRecord,
      deleteRecord: Ouw25ActorSheet.deleteRecord,
      toggleForcedMode: Ouw25ActorSheet.toggleForcedMode,
      travelSector: Ouw25ActorSheet.travelSector,
      undoSector: Ouw25ActorSheet.undoSector,
      resetVoyage: Ouw25ActorSheet.resetVoyage,
      psychotherapy: Ouw25ActorSheet.psychotherapy,
      increaseUnrest: Ouw25ActorSheet.increaseUnrest
    }
  };

  static PARTS = {
    notes: { template: `systems/${SYSTEM_ID}/templates/actor-notes.hbs` }
  };

  static TABS = {
    sheet: { initial: "attributes", labelPrefix: "OUW25.Tabs" }
  };

  _getTabsConfig(group) {
    const config = super._getTabsConfig(group);
    if (group !== "sheet") return config;
    return { ...config, tabs: SHEET_TABS[this.actor.type].map(id => ({ id })) };
  }

  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    if (disabled) {
      for (const tab of this.element.querySelectorAll(".ouw25-sheet-tabs button")) tab.disabled = false;
    }
  }

  async _prepareContext(options) {
    const { type, system } = this.actor;
    const merchant = type === "merchant";
    const pension = merchant ? pensionProgress(system.pensionBalance) : null;
    const lethal = merchant ? lethalWoundSlot(system.past, system.fragile) : null;
    const specialtyCount = merchant ? availableSpecialties(system.past).length : 0;
    const debts = merchant ? this.actor.items.filter(item => item.type === "debt") : [];
    const totals = merchant ? debtTotals(debts.map(item => item.system)) : null;
    const relationships = merchant ? this.actor.items.filter(item => item.type === "relationship") : [];
    const traits = merchant ? this.actor.items.filter(item => item.type === "trait") : [];
    const ship = type === "cooperative" ? shipConfiguration(system) : null;
    const contacts = ship ? this.actor.items.filter(item => item.type === "contact").map(item => ({
      id: item.id, name: item.name, location: item.system.location, reason: item.system.reason, amount: item.system.amount
    })) : null;
    const cargo = ship ? this.actor.items.filter(item => item.type === "cargo").map(item => ({
      id: item.id, name: item.name, quantity: item.system.quantity, volume: item.system.volume
    })) : null;
    const listedVolume = cargo?.reduce((total, entry) => total + entry.volume, 0);
    const slotChoices = (slots, choices, labelPrefix, disabled = () => false) => slots.map(slot => ({
      ...slot, choices: choices.map(value => ({
        value, label: `${labelPrefix}.${value}`, selected: slot.value === value,
        disabled: slot.value !== value && disabled(slot, value)
      }))
    }));
    const gears = ship && shipGearSlots(system);
    const installedGear = gears && gears.map(({ value }) => value).filter(value => value !== "none");
    const uniqueGear = new Set(installedGear);
    const voyage = ship && calculateVoyage(system);
    const hold = ship && shipHold(system, listedVolume, ship.compartmentSpace);
    const condition = ship && shipCondition(system);
    const cooperativeChoices = (values, selected, category) => ({
      choices: values.map(value => ({
        value, label: `OUW25.Cooperative.${category}.Names.${value}`, selected: value === (selected ?? "unset")
      })),
      help: selected && selected !== "unset" ? `OUW25.Cooperative.${category}.Help.${selected}` : null
    });
    return {
      ...await super._prepareContext(options),
      notes: system.notes,
      autosaveStatus: game.i18n.localize(`OUW25.SaveStatus.${this.#autosaveStatus}`),
      autosaveStatusState: this.#autosaveStatus.toLowerCase(),
      actorTypeLabel: `TYPES.Actor.${type}`,
      editable: this.isEditable,
      showCollision: this.isEditable && merchant,
      ship: ship && {
        name: system.shipName,
        classes: Array.from({ length: MAX_SHIP_CLASS + 1 }, (_, value) => ({
          value, selected: value === system.shipClass,
          crew: SHIP_CLASS_STATS[value].crew, durability: SHIP_CLASS_STATS[value].durability
        })),
        freeMounts: ship.freeMounts, compartmentSpace: ship.compartmentSpace,
        hold,
        crewCount: system.crewCount, forcedMode: system.forcedMode,
        illuminationMode: system.illuminationMode, unrestInput: system.unrest,
        travelSectors: system.travelSectors, travelWatches: system.travelWatches,
        travelStatus: system.travelStatus, canTravel: this.isEditable && !voyage.travelBlocked,
        canUndoTransition: this.isEditable && Boolean(system.lastTransition),
        voyage,
        forcedDisabled: voyage.wornEngine && !system.forcedMode,
        cargoLoad: system.cargoLoad, fuelStock: system.fuelStock, provisionsStock: system.provisionsStock,
        mounts: slotChoices(ship.mounts, MOUNT_CHOICES, "OUW25.Ship.MountChoices"),
        compartments: slotChoices(ship.compartments, Object.keys(COMPARTMENT_SPACE), "OUW25.Ship.CompartmentChoices",
          ({ value: current }, value) => COMPARTMENT_SPACE[value] > (COMPARTMENT_SPACE[current] ?? 0)
            && hold.occupied + COMPARTMENT_SPACE[value] - (COMPARTMENT_SPACE[current] ?? 0) > hold.capacity),
        gear: slotChoices(gears, SHIP_GEAR_CHOICES, "OUW25.ShipGear.Names", (_slot, value) => uniqueGear.has(value)),
        gearHelp: [...uniqueGear].map(value => `OUW25.ShipGear.Help.${value}`),
        gearDuplicates: installedGear.length !== uniqueGear.size,
        condition: condition && {
          ...condition,
          slots: condition.slots.map(slot => ({ ...slot, critical: slot.number >= condition.durability }))
        },
        qualities: Object.entries(SHIP_QUALITIES).map(([kind, choices]) => {
          const slots = shipQualitySlots(system, kind);
          const selected = slots.map(({ value }) => value).filter(value => value !== "none");
          const unique = [...new Set(selected)];
          const labels = "OUW25.ShipQuality.Names";
          return {
            title: `OUW25.ShipQuality.${kind}.Title`, slotLabel: `OUW25.ShipQuality.${kind}.Slot`,
            slots: slotChoices(slots, choices, labels, (_slot, value) => unique.includes(value)),
            duplicates: selected.length !== unique.length,
            help: unique.map(value => ({ name: `${labels}.${value}`, text: `OUW25.ShipQuality.Help.${value}` })),
            holdBonuses: unique.includes("large_hold") ? HOLD_BONUSES.map(value => ({
              value, selected: value === system.holdBonus
            })) : null
          };
        })
      },
      contacts: contacts && {
        entries: contacts,
        total: String(contacts.reduce((total, { amount }) => total + BigInt(amount), 0n))
      },
      cooperative: ship && {
        reputation: cooperativeChoices(COOPERATIVE_REPUTATIONS, system.reputation, "Reputation"),
        memory: cooperativeChoices(COOPERATIVE_MEMORIES, system.memory, "Memory")
      },
      contracts: type === "cooperative" ? this.actor.items.filter(item => item.type === "contract").map(item => ({
        id: item.id, name: item.name, location: item.system.location, deadline: item.system.deadline, amount: item.system.amount
      })) : null,
      showContracts: type === "cooperative",
      cargo: cargo && {
        entries: cargo,
        volume: listedVolume
      },
      money: merchant ? { value: system.pocketMoney, field: "pocketMoney", label: "OUW25.Finance.PocketMoney" }
        : { value: system.budget, field: "budget", label: "OUW25.Finance.Budget" },
      pension: pension && { balance: system.pensionBalance, ...pension, complete: pension.untilNext === null },
      ledger: merchant ? {
        totals,
        payableWarning: BigInt(totals.payable) > 1000n,
        payableScale: Math.max(0.9, 2 - 0.16 * Math.log10(1 + Number(totals.payable))),
        groups: DEBT_DIRECTIONS.map(direction => ({
          label: `OUW25.Debt.${direction}`,
          entries: debts.filter(item => item.system.direction === direction).map(item => ({
            id: item.id, name: item.name, location: item.system.location, amount: item.system.amount
          }))
        }))
      } : null,
      relationships: merchant ? RELATION_KINDS.map(kind => ({
        kind, tab: kind === "friend" ? "friends" : "illwishers", label: `OUW25.Relationship.${kind}`,
        entries: relationships.filter(item => item.system.direction === kind).map(item => ({
          id: item.id, name: item.name, location: item.system.location, reason: item.system.reason
        }))
      })) : null,
      possessions: merchant ? {
        entries: this.actor.items.filter(item => item.type === "possession").map(item => ({
          id: item.id, name: item.name, amount: item.system.amount
        }))
      } : null,
      identity: merchant ? {
        name: this.actor.name, img: this.actor.img,
        hasPortrait: Boolean(this.actor.img && this.actor.img !== DEFAULT_ACTOR_IMAGE), dream: system.dream,
        hiring: MERCHANT_HIRING.map(value => ({
          value, label: `OUW25.Identity.Hiring.${value}`, selected: value === (system.hiring ?? "unset")
        })),
        hiringHelp: system.hiring && system.hiring !== "unset" ? `OUW25.Identity.HiringHelp.${system.hiring}` : null,
        actions: personalActionButtons("hiring", system.hiring)
      } : null,
      pastMoves: merchant && system.past && system.past !== "unset" ? {
        help: `OUW25.PersonalAction.PastHelp.${system.past}`,
        actions: personalActionButtons("past", system.past)
      } : null,
      traits: merchant ? Object.entries(MERCHANT_TRAITS).map(([kind, codes]) => ({
        kind, label: `OUW25.Trait.${kind}.Title`, primary: `OUW25.Trait.${kind}.Primary`,
        add: `OUW25.Trait.${kind}.Add`, choices: traitChoices(kind, system[kind] ?? "unset", true),
        help: codes.includes(system[kind]) ? `OUW25.Trait.Help.${system[kind]}` : null,
        entries: traits.filter(item => codes.includes(item.system.code)).map(({ id, system: { code } }) => ({
          id, name: `OUW25.Trait.Names.${code}`, help: `OUW25.Trait.Help.${code}`
        }))
      })) : null,
      condition: merchant ? {
        specialties: MERCHANT_SPECIALTIES.map(value => ({
          value, label: `OUW25.Specialty.${value}`, selected: value === system.specialty,
          help: value === "unset" ? null : `OUW25.Specialty.Help.${value}`
        })),
        specialtyConflict: !isSpecialtyAllowed(system.specialty, system.past),
        specialtyRestriction: specialtyCount < 4 ? `OUW25.Specialty.Restriction.${system.past}` : null,
        specialtyFormula: specialtyCount > 1 ? `1d${specialtyCount}` : null,
        pasts: MERCHANT_PASTS.map(value => ({
          value, label: `OUW25.Past.${value}`, selected: value === system.past
        })),
        showFragile: system.past === "deprived",
        fragile: system.fragile,
        luck: system.luck,
        canSpend: system.luck > 0,
        canAdd: system.luck < Number.MAX_SAFE_INTEGER,
        wounds: WOUND_SLOTS.slice(0, lethal).map(slot => ({ slot, marked: system[`wound${slot}`], lethal: slot === lethal }))
      } : null
    };
  }

  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    return this.#autosaveField(event);
  }

  async _onClickAction(event, target) {
    try {
      await this.#autosaveQueue;
    } catch {
      return;
    }
    if (this.#invalidAutosaveFields.size) return;
    return super._onClickAction(event, target);
  }

  async _onSubmitForm(formConfig, event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!this.isEditable || !form) return;
    const formData = new foundry.applications.ux.FormDataExtended(form);
    await this.#autosaveQueue.catch(() => {});
    this.#submitRejected = false;
    this.#setAutosaveStatus("Saving");
    try {
      const result = await formConfig.handler?.call(this, event, form, formData);
      if (this.#submitRejected) {
        this.#setAutosaveStatus("Invalid");
        return result;
      }
      this.#invalidAutosaveFields.clear();
      this.#autosaveQueue = Promise.resolve();
      this.#setAutosaveStatus("Saved");
      return result;
    } catch (error) {
      this.#setAutosaveStatus("Error");
      console.error(error);
      ui.notifications.error(game.i18n.localize("OUW25.SaveStatus.Error"));
      throw error;
    }
  }

  #setAutosaveStatus(status) {
    this.#autosaveStatus = status;
    const statusElement = this.element?.querySelector("[data-autosave-status]");
    if (!statusElement) return;
    statusElement.textContent = game.i18n.localize(`OUW25.SaveStatus.${status}`);
    statusElement.dataset.state = status.toLowerCase();
  }

  #autosaveField(event) {
    const input = event.target;
    if (!this.isEditable || !input || input.disabled || input.readOnly
      || input.dataset?.autosave === "false") return;
    const name = input.name;
    if (!name || (name !== "name" && !name.startsWith("system."))) return;
    if (this.form && !this.form.contains(input)) return;

    const actorName = name === "name";
    const field = actorName ? "name" : name.slice("system.".length);
    if (!actorName && !(field in this.actor.system)) return;
    const path = actorName ? "name" : `system.${field}`;
    const revision = (this.#autosaveRevisions.get(path) ?? 0) + 1;
    this.#autosaveRevisions.set(path, revision);
    if (typeof input.checkValidity === "function" && !input.checkValidity()) {
      input.reportValidity?.();
      this.#invalidAutosaveFields.add(path);
      this.#setAutosaveStatus("Invalid");
      return;
    }

    const currentValue = actorName ? this.actor.name : this.actor.system[field];
    const value = input.type === "checkbox" ? input.checked
      : typeof currentValue === "number" ? Number(input.value) : input.value;
    if (typeof value === "number" && !Number.isFinite(value)) {
      input.reportValidity?.();
      this.#invalidAutosaveFields.add(path);
      this.#setAutosaveStatus("Invalid");
      return;
    }

    this.#invalidAutosaveFields.delete(path);
    const save = this.#autosaveQueue.catch(() => {}).then(async () => {
      if (this.#autosaveRevisions.get(path) !== revision) return true;
      const savedValue = actorName ? this.actor.name : this.actor.system[field];
      if (Object.is(value, savedValue)) return true;
      if (!actorName && field === "specialty" && !isSpecialtyAllowed(value, this.actor.system.past)) {
        ui.notifications.warn(game.i18n.localize(`OUW25.Specialty.Restriction.${this.actor.system.past}`));
        this.#invalidAutosaveFields.add(path);
        return false;
      }
      if (!actorName && this.actor.type === "cooperative") {
        const error = shipSelectionError(this.actor.system, { [field]: value }, this.#listedCargoVolume());
        if (error) {
          input.value = String(savedValue);
          ui.notifications.warn(game.i18n.localize(error));
          return false;
        }
      }
      await this.actor.update(actorName ? { name: value } : { [path]: value });
      return true;
    });
    this.#autosaveQueue = save;
    this.#setAutosaveStatus("Saving");
    return save.then(saved => {
      if (this.#autosaveQueue === save) {
        this.#setAutosaveStatus(this.#invalidAutosaveFields.size ? "Invalid" : "Saved");
      }
      return saved;
    }).catch(error => {
      if (this.#autosaveQueue === save) this.#setAutosaveStatus("Error");
      console.error(error);
      ui.notifications.error(game.i18n.localize("OUW25.SaveStatus.Error"));
    });
  }

  #listedCargoVolume() {
    return this.actor.items.filter(item => item.type === "cargo").reduce((total, item) => total + item.system.volume, 0);
  }

  static async editRecord(event, target) {
    const actor = this.actor;
    const { recordId: id, recordType: type, recordDirection } = target.dataset;
    const contact = type === "contact";
    const contract = type === "contract";
    const cargo = type === "cargo";
    if (!this.isEditable || actor.type !== (COOPERATIVE_RECORDS.has(type) ? "cooperative" : "merchant") || this.#recordPending) return;
    const key = RECORD_LABELS.get(type);
    if (!key || type === "trait") return;
    const debt = type === "debt";
    const possession = type === "possession";
    const directions = debt ? DEBT_DIRECTIONS : type === "relationship" ? RELATION_KINDS : [];
    const hasAmount = debt || possession || contact || contract;
    const item = id ? actor.items.get(id) : null;
    if (id && item?.type !== type) return;
    this.#recordPending = true;
    try {
      const direction = item?.system.direction ?? (directions.includes(recordDirection) ? recordDirection : directions[0]);
      const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/record-form.hbs`, {
        rootId: `ouw25-record-${foundry.utils.randomID()}`,
        showLocation: !possession && !cargo, contract, cargo, hasAmount,
        hasReason: type === "relationship" || contact, directionLabel: `${key}.Direction`,
        nameLabel: cargo ? `${key}.Name` : contract ? `${key}.Subject` : possession ? `${key}.Description` : "OUW25.Debt.Counterparty",
        locationLabel: contract ? `${key}.Destination` : "OUW25.Debt.Location",
        amountLabel: contact ? `${key}.Debt` : possession || contract ? `${key}.Cost` : "OUW25.Debt.Amount",
        reasonLabel: contact ? `${key}.Relation` : "OUW25.Relationship.Reason", reason: item?.system.reason ?? "",
        name: item?.name ?? "", location: item?.system.location ?? "", amount: item?.system.amount ?? 0,
        deadline: item?.system.deadline ?? "",
        quantity: item?.system.quantity ?? 0, volume: item?.system.volume ?? 0,
        directions: directions.map(value => ({
          value, label: `${key}.${value}`, selected: value === direction
        }))
      });
      const data = await foundry.applications.api.DialogV2.input({
        classes: ["ouw25"],
        window: { title: game.i18n.localize(item ? "OUW25.Debt.Edit" : `${key}.Add`) },
        content, rejectClose: false, ok: { label: game.i18n.localize("OUW25.Save") }
      });
      if (!data || !this.isEditable || (id && actor.items.get(id)?.type !== type)) return;
      const name = String(data.name ?? "").trim();
      const amount = String(data.amount ?? "").trim() ? Number(data.amount) : NaN;
      const quantity = String(data.quantity ?? "").trim() ? Number(data.quantity) : NaN;
      const volume = String(data.volume ?? "").trim() ? Number(data.volume) : NaN;
      if (!name || (directions.length && !directions.includes(data.direction))
        || (hasAmount && (!Number.isSafeInteger(amount) || amount < 0))
        || (cargo && (!Number.isSafeInteger(quantity) || quantity < 0
          || !Number.isFinite(volume) || volume < 0 || volume > Number.MAX_SAFE_INTEGER))) {
        ui.notifications.warn(game.i18n.localize(`${key}.Invalid`));
        return;
      }
      const location = String(data.location ?? "").trim();
      const system = possession || cargo ? {} : { location };
      if (directions.length) system.direction = data.direction;
      if (hasAmount) system.amount = amount;
      if (type === "relationship" || contact) system.reason = String(data.reason ?? "").trim();
      if (contract) system.deadline = String(data.deadline ?? "").trim();
      if (cargo) Object.assign(system, { quantity, volume });
      if (id) await actor.updateEmbeddedDocuments("Item", [{ _id: id, name, system }]);
      else await actor.createEmbeddedDocuments("Item", [{ type, name, system }]);
    } finally {
      this.#recordPending = false;
    }
  }

  static async editTrait(event, target) {
    const actor = this.actor;
    const { creation: kind, recordId: id } = target.dataset;
    if (!this.isEditable || actor.type !== "merchant" || this.#recordPending
      || !Object.hasOwn(MERCHANT_TRAITS, kind)) return;
    const codes = MERCHANT_TRAITS[kind];
    const item = id ? actor.items.get(id) : null;
    const previous = item?.system.code;
    if (id && (item?.type !== "trait" || !codes.includes(previous))) return;
    this.#recordPending = true;
    try {
      const { i18n } = game;
      const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/trait-form.hbs`, {
        choices: traitChoices(kind, previous ?? "unset", true)
      });
      const data = await foundry.applications.api.DialogV2.input({
        classes: ["ouw25"],
        window: { title: i18n.localize(id ? "OUW25.Debt.Edit" : `OUW25.Trait.${kind}.Add`) },
        content, rejectClose: false, ok: { label: i18n.localize("OUW25.Save") }
      });
      if (!data || !this.isEditable) return;
      if (id && actor.items.get(id)?.system.code !== previous) {
        ui.notifications.warn(i18n.localize("OUW25.Creation.Changed"));
        return;
      }
      if (!codes.includes(data.code)) {
        ui.notifications.warn(i18n.localize("OUW25.Trait.Invalid"));
        return;
      }
      const fields = { name: i18n.localize(`OUW25.Trait.Names.${data.code}`), system: { code: data.code } };
      if (id) await actor.updateEmbeddedDocuments("Item", [{ _id: id, ...fields }]);
      else await actor.createEmbeddedDocuments("Item", [{ type: "trait", ...fields }]);
    } finally {
      this.#recordPending = false;
    }
  }

  static async deleteRecord(event, target) {
    const actor = this.actor;
    const { recordId: id, recordType: type } = target.dataset;
    if (!this.isEditable || actor.type !== (COOPERATIVE_RECORDS.has(type) ? "cooperative" : "merchant") || this.#recordPending) return;
    const key = RECORD_LABELS.get(type);
    if (!key || actor.items.get(id)?.type !== type) return;
    this.#recordPending = true;
    try {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        classes: ["ouw25"],
        window: { title: game.i18n.localize("OUW25.Debt.Delete") },
        content: `<p>${game.i18n.localize(`${key}.ConfirmDelete`)}</p>`,
        rejectClose: false
      });
      if (confirmed && this.isEditable && actor.items.get(id)?.type === type) {
        await actor.deleteEmbeddedDocuments("Item", [id]);
      }
    } finally {
      this.#recordPending = false;
    }
  }

  async _processSubmitData(event, form, submitData, options) {
    const { type, system } = this.actor;
    const { specialty = system.specialty, past = system.past } = submitData.system ?? {};
    if (type === "merchant" && specialty !== system.specialty && !isSpecialtyAllowed(specialty, past)) {
      this.#submitRejected = true;
      this.#invalidAutosaveFields.add("system.specialty");
      ui.notifications.warn(game.i18n.localize(`OUW25.Specialty.Restriction.${past}`));
      return {};
    }
    if (type === "cooperative" && submitData.system) {
      const error = shipSelectionError(system, submitData.system, this.#listedCargoVolume());
      if (error) {
        this.#submitRejected = true;
        ui.notifications.warn(game.i18n.localize(error));
        return {};
      }
    }
    return super._processSubmitData(event, form, submitData, options);
  }

  static async rollCreation(event, target) {
    const actor = this.actor;
    if (!this.isEditable || actor.type !== "merchant" || this.#creationRollPending) return;
    const field = target.dataset.creation;
    const config = CREATION_ROLLS.get(field);
    if (!config) return;
    const id = target.dataset.recordId;
    const item = id ? actor.items.get(id) : null;
    if (id && (!Object.hasOwn(MERCHANT_TRAITS, field) || item?.type !== "trait"
      || !MERCHANT_TRAITS[field].includes(item.system.code))) return;
    const { key, resolve, labels, usesPast, actorName, storeLabel } = config;
    const currentValue = () => id ? actor.items.get(id)?.system.code : actorName ? actor.name : actor.system[field];
    const previous = currentValue();
    const { past } = actor.system;
    const specialtyCount = field === "specialty" ? availableSpecialties(past).length : 0;
    if (specialtyCount === 1) return;
    const formula = config.formula ?? `1d${specialtyCount}`;
    const { i18n } = game;
    this.#creationRollPending = true;
    target.disabled = true;
    try {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        classes: ["ouw25"],
        window: { title: i18n.localize(`OUW25.Creation.Roll${key}`) },
        content: `<p>${i18n.format(`OUW25.Creation.Confirm${key}`, { formula })}</p>`,
        rejectClose: false
      });
      if (!confirmed || !this.isEditable) return;
      const { Roll } = foundry.dice;
      const roll = await new Roll(formula).evaluate({ allowInteractive: false });
      if (!this.isEditable) return;
      if (currentValue() !== previous || (usesPast && actor.system.past !== past)) {
        ui.notifications.warn(i18n.localize("OUW25.Creation.Changed"));
        return;
      }
      const value = resolve(roll.total, past, roll);
      const result = labels ? i18n.localize(`${labels}.${value}`) : value;
      if (id) await actor.updateEmbeddedDocuments("Item", [{ _id: id, name: result, "system.code": value }]);
      else if (actorName) await actor.update({ name: value });
      else await actor.update({ [`system.${field}`]: storeLabel ? result : value });
      await roll.toMessage({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
        flavor: i18n.format(`OUW25.Creation.Result${key}`, { result })
      }, { messageMode: game.settings.get("core", "messageMode") });
    } finally {
      this.#creationRollPending = false;
      target.disabled = false;
    }
  }

  static async editPortrait() {
    const actor = this.actor;
    if (!this.isEditable || actor.type !== "merchant") return;
    const { FilePicker } = foundry.applications.apps;
    const picker = new FilePicker.implementation({
      type: "image",
      current: actor.img,
      document: actor,
      callback: path => this.isEditable && actor.update({ img: path })
    });
    await picker.browse();
  }

  static async changeLuck(event, target) {
    const actor = this.actor;
    if (!this.isEditable || actor.type !== "merchant" || this.#luckPending) return;
    const direction = target.dataset.luck;
    if (direction !== "add" && direction !== "spend") return;
    const luck = actor.system.luck + (direction === "add" ? 1 : -1);
    if (luck < 0 || !Number.isSafeInteger(luck)) return;
    this.#luckPending = true;
    try {
      await actor.update({ "system.luck": luck });
    } finally {
      this.#luckPending = false;
    }
  }

  static async depositPension(event, target) {
    const actor = this.actor;
    if (!this.isEditable || actor.type !== "merchant" || this.#depositPending) return;
    const input = target.closest(".ouw25-pension").querySelector("[data-deposit]");
    const amount = input.value;
    const i18n = game.i18n;
    this.#depositPending = true;
    target.disabled = true;
    try {
      pensionBalanceAfterDeposit(actor.system.pensionBalance, amount);
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        classes: ["ouw25"],
        window: { title: i18n.localize("OUW25.Finance.Deposit") },
        content: `<p>${i18n.format("OUW25.Finance.ConfirmDeposit", { amount: Number(amount) })}</p>`,
        rejectClose: false
      });
      if (!confirmed || !this.isEditable) return;
      const pensionBalance = pensionBalanceAfterDeposit(actor.system.pensionBalance, amount);
      await actor.update({ "system.pensionBalance": pensionBalance });
      input.value = "";
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      ui.notifications.warn(i18n.localize("OUW25.Finance.InvalidDeposit"));
    } finally {
      target.disabled = false;
      this.#depositPending = false;
    }
  }

  static async toggleForcedMode(event, target) {
    const actor = this.actor;
    if (!this.isEditable || actor.type !== "cooperative" || PENDING_VOYAGE_OPERATIONS.has(actor.id)) return;
    PENDING_VOYAGE_OPERATIONS.add(actor.id);
    target.disabled = true;
    try {
      try {
        await this.#autosaveQueue;
      } catch {
        return;
      }
      if (!this.isEditable || this.#invalidAutosaveFields.size) return;
      const { i18n } = game;
      const enabling = !actor.system.forcedMode;
      if (enabling && hasWornEngine(actor.system)) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.ForcedBlocked"));
        return;
      }
      const fingerprint = forcedModeFingerprint(actor.system);
      const title = i18n.localize(`OUW25.Voyage.${enabling ? "EnableForced" : "DisableForced"}`);
      const inputs = await foundry.applications.api.DialogV2.input({
        classes: ["ouw25"],
        window: { title },
        content: `<p>${i18n.localize("OUW25.Voyage.ForcedRisk")}</p>
          <label>${i18n.localize("OUW25.Voyage.AdditionalDice")}<input type="number" name="additionalDice" min="0" max="100" step="1" value="0" required></label>
          <label>${i18n.localize("OUW25.Voyage.Complications")}<input type="number" name="complications" min="0" max="104" step="1" value="0" required></label>`,
        rejectClose: false,
        ok: { label: i18n.localize("OUW25.Voyage.RollForced") }
      });
      if (!inputs || !this.isEditable) return;
      const additionalDice = Number(inputs.additionalDice);
      const complications = Number(inputs.complications);
      if (!Number.isSafeInteger(additionalDice) || additionalDice < 0 || additionalDice > 100
        || !Number.isSafeInteger(complications) || complications < 0 || complications > 104) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.InvalidCheckInput"));
        return;
      }
      if (forcedModeFingerprint(actor.system) !== fingerprint) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.StateChanged"));
        return;
      }
      const { Roll } = foundry.dice;
      const roll = await new Roll(`${4 + additionalDice}d6`).evaluate({ allowInteractive: false });
      const dice = roll.dice.flatMap(term => term.results.filter(({ active }) => active).map(({ result }) => result));
      const { outcome, remaining } = resolveCollision(dice, complications);
      const result = i18n.format("OUW25.Collision.Result", {
        outcome: i18n.localize(`OUW25.Collision.${outcome}`), remaining
      });
      const summary = `${title}: ${result}`;
      if (!this.isEditable || forcedModeFingerprint(actor.system) !== fingerprint) {
        const warning = i18n.localize("OUW25.Voyage.StateChanged");
        ui.notifications.warn(warning);
        await publishVoyageRoll(actor, `${summary} ${warning}`, [roll], false);
        return;
      }
      const { forcedMode, damageSlot } = resolveForcedMode(actor.system, remaining);
      const mode = i18n.localize(`OUW25.Voyage.${forcedMode ? "ForcedOn" : "ForcedOff"}`);
      const damage = outcome === "Failure"
        ? ` ${i18n.localize(`OUW25.Voyage.${damageSlot ? "ForcedDamage" : "ForcedDamageFull"}`)}` : "";
      const status = `${summary} ${mode}${damage}`;
      await actor.update({
        "system.forcedMode": forcedMode,
        "system.travelStatus": status,
        ...(damageSlot ? { [`system.damage${damageSlot}`]: true } : {})
      });
      await publishVoyageRoll(actor, status, [roll], true);
    } finally {
      PENDING_VOYAGE_OPERATIONS.delete(actor.id);
      target.disabled = false;
    }
  }

  static async travelSector(event, target) {
    const actor = this.actor;
    if (!this.isEditable || actor.type !== "cooperative" || PENDING_VOYAGE_OPERATIONS.has(actor.id)) return;
    PENDING_VOYAGE_OPERATIONS.add(actor.id);
    target.disabled = true;
    try {
      const { i18n } = game;
      if (hasUnsavedVoyageInputs(target, actor.system)) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.SaveBeforeTransition"));
        return;
      }
      const fingerprint = voyageStateFingerprint(actor.system);
      const transition = prepareSectorTransition(actor.system, foundry.utils.randomID());
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        classes: ["ouw25"],
        window: { title: i18n.localize("OUW25.Voyage.TravelSector") },
        content: `<p>${i18n.format("OUW25.Voyage.ConfirmTransition", transition.costs)}</p><p>${i18n.localize("OUW25.Voyage.SingleOperator")}</p>`,
        rejectClose: false
      });
      if (!confirmed || !this.isEditable) return;
      if (voyageStateFingerprint(actor.system) !== fingerprint) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.StateChanged"));
        return;
      }
      const update = Object.fromEntries(Object.entries(transition.update)
        .map(([field, value]) => [`system.${field}`, value]));
      update["system.travelStatus"] = i18n.format("OUW25.Voyage.TransitionDone", transition.costs);
      await actor.update(update);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      ui.notifications.warn(i18n.localize(error.message));
    } finally {
      PENDING_VOYAGE_OPERATIONS.delete(actor.id);
      target.disabled = false;
    }
  }

  static async undoSector(event, target) {
    const actor = this.actor;
    if (!this.isEditable || actor.type !== "cooperative" || PENDING_VOYAGE_OPERATIONS.has(actor.id)) return;
    PENDING_VOYAGE_OPERATIONS.add(actor.id);
    target.disabled = true;
    try {
      const { i18n } = game;
      if (hasUnsavedVoyageInputs(target, actor.system)) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.SaveBeforeTransition"));
        return;
      }
      const fingerprint = voyageStateFingerprint(actor.system);
      const rollback = rollbackSectorTransition(actor.system);
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        classes: ["ouw25"],
        window: { title: i18n.localize("OUW25.Voyage.UndoSector") },
        content: `<p>${i18n.format("OUW25.Voyage.ConfirmUndo", rollback.costs)}</p><p>${i18n.localize("OUW25.Voyage.SingleOperator")}</p>`,
        rejectClose: false
      });
      if (!confirmed || !this.isEditable) return;
      if (voyageStateFingerprint(actor.system) !== fingerprint) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.StateChanged"));
        return;
      }
      const update = Object.fromEntries(Object.entries(rollback)
        .filter(([field]) => field !== "costs")
        .map(([field, value]) => [`system.${field}`, value]));
      update["system.travelStatus"] = i18n.localize("OUW25.Voyage.TransitionUndone");
      await actor.update(update);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      ui.notifications.warn(i18n.localize(error.message));
    } finally {
      PENDING_VOYAGE_OPERATIONS.delete(actor.id);
      target.disabled = false;
    }
  }

  static async resetVoyage(event, target) {
    const actor = this.actor;
    if (!this.isEditable || actor.type !== "cooperative" || PENDING_VOYAGE_OPERATIONS.has(actor.id)) return;
    PENDING_VOYAGE_OPERATIONS.add(actor.id);
    target.disabled = true;
    try {
      const { i18n } = game;
      if (hasUnsavedVoyageInputs(target, actor.system)) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.SaveBeforeTransition"));
        return;
      }
      const fingerprint = voyageStateFingerprint(actor.system);
      const reset = prepareVoyageReset(actor.system);
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        classes: ["ouw25"],
        window: { title: i18n.localize("OUW25.Voyage.ResetCounters") },
        content: `<p>${i18n.localize("OUW25.Voyage.ConfirmReset")}</p>`,
        rejectClose: false
      });
      if (!confirmed || !this.isEditable) return;
      if (voyageStateFingerprint(actor.system) !== fingerprint) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.StateChanged"));
        return;
      }
      const update = Object.fromEntries(Object.entries(reset.update)
        .map(([field, value]) => [`system.${field}`, value]));
      const status = actor.system.lastTransition && !reset.rollbackPreserved
        ? "OUW25.Voyage.ResetRollbackUnavailable" : "OUW25.Voyage.ResetDone";
      update["system.travelStatus"] = i18n.localize(status);
      await actor.update(update);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      ui.notifications.warn(i18n.localize(error.message));
    } finally {
      PENDING_VOYAGE_OPERATIONS.delete(actor.id);
      target.disabled = false;
    }
  }

  static async psychotherapy(event, target) {
    const actor = this.actor;
    if (!this.isEditable || actor.type !== "cooperative" || PENDING_VOYAGE_OPERATIONS.has(actor.id)) return;
    PENDING_VOYAGE_OPERATIONS.add(actor.id);
    target.disabled = true;
    try {
      const { i18n } = game;
      if (hasUnsavedVoyageInputs(target, actor.system)) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.SaveBeforeTransition"));
        return;
      }
      const fingerprint = voyageStateFingerprint(actor.system);
      const startingUnrest = actor.system.unrest;
      const inputs = await foundry.applications.api.DialogV2.input({
        classes: ["ouw25"],
        window: { title: i18n.localize("OUW25.Voyage.Psychotherapy") },
        content: `<label>${i18n.localize("OUW25.Voyage.AdditionalDice")}<input type="number" name="additionalDice" min="0" max="100" step="1" value="0" required></label>
          <label>${i18n.localize("OUW25.Voyage.Complications")}<input type="number" name="complications" min="0" max="104" step="1" value="0" required></label>`,
        rejectClose: false,
        ok: { label: i18n.localize("OUW25.Voyage.RollTherapy") }
      });
      if (!inputs || !this.isEditable) return;
      const additionalDice = Number(inputs.additionalDice);
      const complications = Number(inputs.complications);
      if (!Number.isSafeInteger(additionalDice) || additionalDice < 0 || additionalDice > 100
        || !Number.isSafeInteger(complications) || complications < 0 || complications > 104) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.InvalidTherapyInput"));
        return;
      }
      if (voyageStateFingerprint(actor.system) !== fingerprint) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.StateChanged"));
        return;
      }
      const { Roll } = foundry.dice;
      const successRoll = await new Roll(`${4 + additionalDice}d6`).evaluate({ allowInteractive: false });
      const reliefRoll = await new Roll("1d6").evaluate({ allowInteractive: false });
      const successes = successRoll.dice.flatMap(term => term.results)
        .filter(({ active, result }) => active && result >= 6).length - complications;
      const outcome = resolvePsychotherapy(startingUnrest, successes, reliefRoll.total);
      if (!this.isEditable || voyageStateFingerprint(actor.system) !== fingerprint) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.StateChanged"));
        await publishVoyageRoll(actor, i18n.format("OUW25.Voyage.TherapyNotApplied", {
          successes, relief: outcome.relief
        }), [successRoll, reliefRoll], false);
        return;
      }
      await actor.update({
        "system.unrest": outcome.unrest,
        "system.travelStatus": i18n.format("OUW25.Voyage.TherapyDone", { relief: outcome.relief })
      });
      await publishVoyageRoll(actor, i18n.format("OUW25.Voyage.TherapyChat", {
        successes, relief: outcome.relief
      }), [successRoll, reliefRoll], true);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      ui.notifications.warn(i18n.localize(error.message));
    } finally {
      PENDING_VOYAGE_OPERATIONS.delete(actor.id);
      target.disabled = false;
    }
  }

  static async increaseUnrest(event, target) {
    const actor = this.actor;
    if (!this.isEditable || actor.type !== "cooperative" || PENDING_VOYAGE_OPERATIONS.has(actor.id)) return;
    PENDING_VOYAGE_OPERATIONS.add(actor.id);
    target.disabled = true;
    try {
      const { i18n } = game;
      if (hasUnsavedVoyageInputs(target, actor.system)) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.SaveBeforeTransition"));
        return;
      }
      const fingerprint = voyageStateFingerprint(actor.system);
      const startingUnrest = actor.system.unrest;
      const inputs = await foundry.applications.api.DialogV2.input({
        classes: ["ouw25"],
        window: { title: i18n.localize("OUW25.Voyage.IncreaseUnrest") },
        content: `<label>${i18n.localize("OUW25.Voyage.IncreaseAmount")}
          <select name="increaseType">
            <option value="one">${i18n.localize("OUW25.Voyage.IncreaseOne")}</option>
            <option value="oneDie">${i18n.localize("OUW25.Voyage.IncreaseOneDie")}</option>
            <option value="twoDice">${i18n.localize("OUW25.Voyage.IncreaseTwoDice")}</option>
            <option value="threeDice">${i18n.localize("OUW25.Voyage.IncreaseThreeDice")}</option>
            <option value="custom">${i18n.localize("OUW25.Voyage.IncreaseCustom")}</option>
          </select>
        </label>
        <label>${i18n.localize("OUW25.Voyage.CustomIncrease")}<input type="number" name="customIncrease" min="0" max="9007199254740991" step="1" value="1"></label>`,
        rejectClose: false,
        ok: { label: i18n.localize("OUW25.Voyage.ApplyIncrease") }
      });
      if (!inputs || !this.isEditable) return;
      if (!["one", "oneDie", "twoDice", "threeDice", "custom"].includes(inputs.increaseType)) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.InvalidIncrease"));
        return;
      }
      if (voyageStateFingerprint(actor.system) !== fingerprint) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.StateChanged"));
        return;
      }
      const formulas = { oneDie: "1d6", twoDice: "2d6", threeDice: "3d6" };
      const formula = formulas[inputs.increaseType];
      const roll = formula
        ? await new foundry.dice.Roll(formula).evaluate({ allowInteractive: false })
        : null;
      const gain = inputs.increaseType === "one" ? 1
        : inputs.increaseType === "custom" ? Number(inputs.customIncrease)
          : roll.total;
      const outcome = prepareUnrestIncrease(startingUnrest, gain);
      if (!this.isEditable || voyageStateFingerprint(actor.system) !== fingerprint) {
        ui.notifications.warn(i18n.localize("OUW25.Voyage.StateChanged"));
        await publishVoyageRoll(actor, i18n.format("OUW25.Voyage.IncreaseNotApplied", {
          increase: outcome.increase
        }), [roll], false);
        return;
      }
      await actor.update({
        "system.unrest": outcome.unrest,
        "system.travelStatus": i18n.format("OUW25.Voyage.UnrestIncreased", {
          increase: outcome.increase
        })
      });
      await publishVoyageRoll(actor, i18n.format("OUW25.Voyage.IncreaseChat", {
        increase: outcome.increase
      }), [roll], true);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      ui.notifications.warn(i18n.localize(error.message));
    } finally {
      PENDING_VOYAGE_OPERATIONS.delete(actor.id);
      target.disabled = false;
    }
  }

  static async rollPersonalAction(event, target) {
    const actor = this.actor;
    if (!this.isEditable || actor.type !== "merchant" || target.disabled) return;
    const { source, profile, move } = target.dataset;
    if (source !== "past" && source !== "hiring") return;
    const action = personalActions(source, actor.system[source]).find(({ id }) => id === move);
    if (!action || actor.system[source] !== profile) return;
    const { i18n } = game;
    const title = i18n.localize(`OUW25.PersonalAction.Moves.${move}.label`);
    if (action.collision) return Ouw25ActorSheet.#rollCollision.call(this, target, title);

    target.disabled = true;
    try {
      let formula = action.formula;
      if (action.supplies) {
        const label = i18n.localize("OUW25.PersonalAction.Successes");
        const data = await foundry.applications.api.DialogV2.input({
          classes: ["ouw25"],
          window: { title },
          content: `<label>${label}<input type="number" name="successes" min="1" max="100" step="1" value="1" required></label>`,
          rejectClose: false
        });
        if (!data) return;
        try {
          formula = provisionFormula(data.successes);
        } catch (error) {
          if (!(error instanceof RangeError)) throw error;
          ui.notifications.warn(i18n.localize("OUW25.PersonalAction.InvalidSuccesses"));
          return;
        }
      }
      if (!this.isEditable || actor.system[source] !== profile) return;
      const { Roll } = foundry.dice;
      const { ChatMessage } = foundry.documents;
      const messageMode = game.settings.get("core", "messageMode");
      const roll = await new Roll(formula).evaluate({ allowInteractive: false });
      const outcome = personalOutcome(action, roll.total);
      const data = { ...outcome.data };
      const rolls = [roll];
      for (const [key, extraFormula] of Object.entries(outcome.extra)) {
        const extra = await new Roll(extraFormula).evaluate({ allowInteractive: false });
        rolls.push(extra);
        data[key] = extra.total;
      }
      if (!this.isEditable || actor.system[source] !== profile) return;
      const result = i18n.format(outcome.key, data);
      const message = {
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: i18n.format("OUW25.PersonalAction.Result", { title, result }),
        rolls
      };
      ChatMessage.applyRollMode(message, messageMode);
      await ChatMessage.create(message);
    } finally {
      target.disabled = false;
    }
  }

  static async rollCollision(event, target) {
    return Ouw25ActorSheet.#rollCollision.call(this, target);
  }

  static async #rollCollision(target, title) {
    if (!this.isEditable || this.actor.type !== "merchant" || target.disabled) return;
    const section = target.closest(".ouw25-notes").querySelector(".ouw25-collision");
    let input;
    try {
      input = parseCollisionInput(section.querySelector("[data-dice]").value, section.querySelector("[data-deduction]").value);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      ui.notifications.warn(game.i18n.localize("OUW25.Collision.InvalidInput"));
      return;
    }

    target.disabled = true;
    try {
      const { Roll } = foundry.dice;
      const { ChatMessage } = foundry.documents;
      const messageMode = game.settings.get("core", "messageMode");
      const roll = await new Roll(`${input.diceCount}d6`).evaluate({ allowInteractive: messageMode !== "blind" });
      const dice = roll.dice.flatMap(term => term.results.filter(result => result.active).map(result => result.result));
      const { outcome, remaining } = resolveCollision(dice, input.deduction);
      const result = game.i18n.format("OUW25.Collision.Result", {
          outcome: game.i18n.localize(`OUW25.Collision.${outcome}`),
          remaining
      });
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: title ? game.i18n.format("OUW25.PersonalAction.Result", { title, result }) : result
      }, { messageMode });
    } finally {
      target.disabled = false;
    }
  }
}

Hooks.once("init", () => {
  const models = { merchant: MerchantModel, cooperative: CooperativeModel };
  CONFIG.Actor.documentClass = Ouw25Actor;
  Object.assign(CONFIG.Actor.dataModels, models);
  CONFIG.Item.dataModels.debt = DebtModel;
  CONFIG.Item.dataModels.relationship = RelationshipModel;
  CONFIG.Item.dataModels.possession = PossessionModel;
  CONFIG.Item.dataModels.trait = TraitModel;
  CONFIG.Item.dataModels.contact = ContactModel;
  CONFIG.Item.dataModels.contract = ContractModel;
  CONFIG.Item.dataModels.cargo = CargoModel;
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, Ouw25ActorSheet, {
    types: Object.keys(models),
    makeDefault: true,
    label: "OUW25.ActorSheet"
  });
});
