import { parseCollisionInput, resolveCollision } from "./collision.mjs";
import { DEBT_DIRECTIONS, debtTotals, pensionBalanceAfterDeposit, pensionProgress } from "./finance.mjs";
import { lethalWoundSlot, MERCHANT_PASTS, pastFromRoll, startingPocketMoney } from "./merchant.mjs";
import { availableSpecialties, isSpecialtyAllowed, MERCHANT_SPECIALTIES, specialtyFromRoll } from "./merchant.mjs";
import { dreamFromRoll, hiringFromRoll, MERCHANT_HIRING, merchantNameFromRolls } from "./merchant.mjs";
import { COMPARTMENT_SPACE, MAX_SHIP_CLASS, MOUNT_CHOICES, SHIP_SLOT_COUNT, shipConfiguration } from "./ship.mjs";
import { MERCHANT_TRAITS, traitFromRoll } from "./traits.mjs";
import { personalActions, personalOutcome, provisionFormula } from "./personal-actions.mjs";

const SYSTEM_ID = "ouw25";
const WOUND_SLOTS = [1, 2, 3, 4];
const RELATION_KINDS = ["friend", "enemy"];
const RECORD_LABELS = new Map([
  ["debt", "OUW25.Debt"],
  ["relationship", "OUW25.Relationship"],
  ["possession", "OUW25.Possession"],
  ["trait", "OUW25.Trait"],
  ["contact", "OUW25.Contact"]
]);
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
  static defineSchema() {
    const { NumberField, StringField } = foundry.data.fields;
    const fields = {
      ...super.defineSchema(), budget: counterField(), shipName: new StringField({ initial: "" }),
      shipClass: new NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0, max: MAX_SHIP_CLASS })
    };
    for (let slot = 1; slot <= SHIP_SLOT_COUNT; slot++) {
      fields[`mount${slot}`] = new StringField({ initial: slot === 1 ? "slagthrower" : "none", choices: MOUNT_CHOICES });
      fields[`compartment${slot}`] = new StringField({ initial: "none", choices: Object.keys(COMPARTMENT_SPACE) });
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
    id, source, value, label: `OUW25.PersonalAction.Moves.${id}.label`
  }));
}

class Ouw25ActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  #depositPending = false;
  #luckPending = false;
  #creationRollPending = false;
  #recordPending = false;

  static DEFAULT_OPTIONS = {
    classes: ["ouw25"],
    position: { width: 540 },
    actions: {
      rollCollision: Ouw25ActorSheet.rollCollision,
      depositPension: Ouw25ActorSheet.depositPension,
      changeLuck: Ouw25ActorSheet.changeLuck,
      rollCreation: Ouw25ActorSheet.rollCreation,
      rollPersonalAction: Ouw25ActorSheet.rollPersonalAction,
      editTrait: Ouw25ActorSheet.editTrait,
      editRecord: Ouw25ActorSheet.editRecord,
      deleteRecord: Ouw25ActorSheet.deleteRecord
    }
  };

  static PARTS = {
    notes: { template: `systems/${SYSTEM_ID}/templates/actor-notes.hbs` }
  };

  async _prepareContext(options) {
    const { type, system } = this.actor;
    const merchant = type === "merchant";
    const pension = merchant ? pensionProgress(system.pensionBalance) : null;
    const lethal = merchant ? lethalWoundSlot(system.past, system.fragile) : null;
    const specialtyCount = merchant ? availableSpecialties(system.past).length : 0;
    const debts = merchant ? this.actor.items.filter(item => item.type === "debt") : [];
    const relationships = merchant ? this.actor.items.filter(item => item.type === "relationship") : [];
    const traits = merchant ? this.actor.items.filter(item => item.type === "trait") : [];
    const ship = type === "cooperative" ? shipConfiguration(system) : null;
    const contacts = ship ? this.actor.items.filter(item => item.type === "contact").map(item => ({
      id: item.id, name: item.name, location: item.system.location, reason: item.system.reason, amount: item.system.amount
    })) : null;
    const slotChoices = (slots, choices, labelPrefix) => slots.map(slot => ({
      ...slot, choices: choices.map(value => ({
        value, label: `${labelPrefix}.${value}`, selected: slot.value === value
      }))
    }));
    return {
      ...await super._prepareContext(options),
      notes: system.notes,
      actorTypeLabel: `TYPES.Actor.${type}`,
      editable: this.isEditable,
      showCollision: this.isEditable && merchant,
      ship: ship && {
        name: system.shipName,
        classes: Array.from({ length: MAX_SHIP_CLASS + 1 }, (_, value) => ({ value, selected: value === system.shipClass })),
        freeMounts: ship.freeMounts, compartmentSpace: ship.compartmentSpace,
        mounts: slotChoices(ship.mounts, MOUNT_CHOICES, "OUW25.Ship.MountChoices"),
        compartments: slotChoices(ship.compartments, Object.keys(COMPARTMENT_SPACE), "OUW25.Ship.CompartmentChoices")
      },
      contacts: contacts && {
        entries: contacts,
        total: String(contacts.reduce((total, { amount }) => total + BigInt(amount), 0n))
      },
      money: merchant ? { value: system.pocketMoney, field: "pocketMoney", label: "OUW25.Finance.PocketMoney" }
        : { value: system.budget, field: "budget", label: "OUW25.Finance.Budget" },
      pension: pension && { balance: system.pensionBalance, ...pension, complete: pension.untilNext === null },
      ledger: merchant ? { totals: debtTotals(debts.map(item => item.system)), groups: DEBT_DIRECTIONS.map(direction => ({
        label: `OUW25.Debt.${direction}`,
        entries: debts.filter(item => item.system.direction === direction).map(item => ({
          id: item.id, name: item.name, location: item.system.location, amount: item.system.amount
        }))
      })) } : null,
      relationships: merchant ? RELATION_KINDS.map(kind => ({
        label: `OUW25.Relationship.${kind}`,
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
        name: this.actor.name, dream: system.dream,
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
          value, label: `OUW25.Specialty.${value}`, selected: value === system.specialty
        })),
        specialtyHelp: system.specialty === "unset" ? null : `OUW25.Specialty.Help.${system.specialty}`,
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

  static async editRecord(event, target) {
    const actor = this.actor;
    const { recordId: id, recordType: type } = target.dataset;
    const contact = type === "contact";
    if (!this.isEditable || actor.type !== (contact ? "cooperative" : "merchant") || this.#recordPending) return;
    const key = RECORD_LABELS.get(type);
    if (!key || type === "trait") return;
    const debt = type === "debt";
    const possession = type === "possession";
    const directions = debt ? DEBT_DIRECTIONS : type === "relationship" ? RELATION_KINDS : [];
    const hasAmount = debt || possession || contact;
    const item = id ? actor.items.get(id) : null;
    if (id && item?.type !== type) return;
    this.#recordPending = true;
    try {
      const direction = item?.system.direction ?? directions[0];
      const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/record-form.hbs`, {
        rootId: `ouw25-record-${foundry.utils.randomID()}`,
        possession, hasAmount, hasReason: type === "relationship" || contact, directionLabel: `${key}.Direction`,
        amountLabel: contact ? `${key}.Debt` : possession ? `${key}.Cost` : "OUW25.Debt.Amount",
        reasonLabel: contact ? `${key}.Relation` : "OUW25.Relationship.Reason", reason: item?.system.reason ?? "",
        name: item?.name ?? "", location: item?.system.location ?? "", amount: item?.system.amount ?? 0,
        directions: directions.map(value => ({
          value, label: `${key}.${value}`, selected: value === direction
        }))
      });
      const data = await foundry.applications.api.DialogV2.input({
        window: { title: game.i18n.localize(item ? "OUW25.Debt.Edit" : `${key}.Add`) },
        content, rejectClose: false, ok: { label: game.i18n.localize("OUW25.Save") }
      });
      if (!data || !this.isEditable || (id && actor.items.get(id)?.type !== type)) return;
      const name = String(data.name ?? "").trim();
      const amount = String(data.amount ?? "").trim() ? Number(data.amount) : NaN;
      if (!name || (directions.length && !directions.includes(data.direction))
        || (hasAmount && (!Number.isSafeInteger(amount) || amount < 0))) {
        ui.notifications.warn(game.i18n.localize(`${key}.Invalid`));
        return;
      }
      const location = String(data.location ?? "").trim();
      const system = possession ? {} : { location };
      if (directions.length) system.direction = data.direction;
      if (hasAmount) system.amount = amount;
      if (type === "relationship" || contact) system.reason = String(data.reason ?? "").trim();
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
    if (!this.isEditable || actor.type !== (type === "contact" ? "cooperative" : "merchant") || this.#recordPending) return;
    const key = RECORD_LABELS.get(type);
    if (!key || actor.items.get(id)?.type !== type) return;
    this.#recordPending = true;
    try {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
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
      ui.notifications.warn(game.i18n.localize(`OUW25.Specialty.Restriction.${past}`));
      return {};
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
        window: { title: i18n.format(`OUW25.Creation.Roll${key}`, { formula }) },
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
  Object.assign(CONFIG.Actor.dataModels, models);
  CONFIG.Item.dataModels.debt = DebtModel;
  CONFIG.Item.dataModels.relationship = RelationshipModel;
  CONFIG.Item.dataModels.possession = PossessionModel;
  CONFIG.Item.dataModels.trait = TraitModel;
  CONFIG.Item.dataModels.contact = ContactModel;
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, Ouw25ActorSheet, {
    types: Object.keys(models),
    makeDefault: true,
    label: "OUW25.ActorSheet"
  });
});
