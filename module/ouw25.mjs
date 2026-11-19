import { parseCollisionInput, resolveCollision } from "./collision.mjs";
import { DEBT_DIRECTIONS, debtTotals, pensionBalanceAfterDeposit, pensionProgress } from "./finance.mjs";
import { lethalWoundSlot, MERCHANT_PASTS, pastFromRoll, startingPocketMoney } from "./merchant.mjs";
import { availableSpecialties, isSpecialtyAllowed, MERCHANT_SPECIALTIES, specialtyFromRoll } from "./merchant.mjs";

const SYSTEM_ID = "ouw25";
const WOUND_SLOTS = [1, 2, 3, 4];
const CREATION_ROLLS = new Map([
  ["past", { key: "Past", formula: "3d6", resolve: pastFromRoll, labels: "OUW25.Past" }],
  ["specialty", { key: "Specialty", resolve: specialtyFromRoll, labels: "OUW25.Specialty", usesPast: true }],
  ["pocketMoney", { key: "Money", formula: "4d6", resolve: startingPocketMoney, usesPast: true }]
]);
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
    const wounds = Object.fromEntries(WOUND_SLOTS.map(slot => [
      `wound${slot}`, new foundry.data.fields.BooleanField({ initial: false })
    ]));
    return { ...super.defineSchema(), pocketMoney: counterField(), pensionBalance: counterField(),
      luck: counterField(1),
      specialty: new foundry.data.fields.StringField({ initial: "unset", choices: MERCHANT_SPECIALTIES }),
      past: new foundry.data.fields.StringField({ initial: "unset", choices: MERCHANT_PASTS }),
      fragile: new foundry.data.fields.BooleanField({ initial: false }),
      ...wounds };
  }
}

class CooperativeModel extends NotesModel {
  static defineSchema() {
    return { ...super.defineSchema(), budget: counterField() };
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

class Ouw25ActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  #depositPending = false;
  #luckPending = false;
  #creationRollPending = false;
  #debtPending = false;

  static DEFAULT_OPTIONS = {
    classes: ["ouw25"],
    position: { width: 540 },
    actions: {
      rollCollision: Ouw25ActorSheet.rollCollision,
      depositPension: Ouw25ActorSheet.depositPension,
      changeLuck: Ouw25ActorSheet.changeLuck,
      rollCreation: Ouw25ActorSheet.rollCreation,
      editDebt: Ouw25ActorSheet.editDebt,
      deleteDebt: Ouw25ActorSheet.deleteDebt
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
    return {
      ...await super._prepareContext(options),
      notes: system.notes,
      actorTypeLabel: `TYPES.Actor.${type}`,
      editable: this.isEditable,
      showCollision: this.isEditable && merchant,
      money: merchant ? { value: system.pocketMoney, field: "pocketMoney", label: "OUW25.Finance.PocketMoney" }
        : { value: system.budget, field: "budget", label: "OUW25.Finance.Budget" },
      pension: pension && { balance: system.pensionBalance, ...pension, complete: pension.untilNext === null },
      ledger: merchant ? { totals: debtTotals(debts.map(item => item.system)), groups: DEBT_DIRECTIONS.map(direction => ({
        label: `OUW25.Debt.${direction}`,
        entries: debts.filter(item => item.system.direction === direction).map(item => ({
          id: item.id, name: item.name, location: item.system.location, amount: item.system.amount
        }))
      })) } : null,
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

  static async editDebt(event, target) {
    const actor = this.actor;
    if (!this.isEditable || actor.type !== "merchant" || this.#debtPending) return;
    const id = target.dataset.debtId;
    const item = id ? actor.items.get(id) : null;
    if (id && item?.type !== "debt") return;
    this.#debtPending = true;
    try {
      const direction = item?.system.direction ?? "payable";
      const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/debt-form.hbs`, {
        rootId: `ouw25-debt-${foundry.utils.randomID()}`,
        name: item?.name ?? "", location: item?.system.location ?? "", amount: item?.system.amount ?? 0,
        directions: DEBT_DIRECTIONS.map(value => ({
          value, label: `OUW25.Debt.${value}`, selected: value === direction
        }))
      });
      const data = await foundry.applications.api.DialogV2.input({
        window: { title: game.i18n.localize(item ? "OUW25.Debt.Edit" : "OUW25.Debt.Add") },
        content, rejectClose: false, ok: { label: game.i18n.localize("OUW25.Save") }
      });
      if (!data || !this.isEditable || (id && actor.items.get(id)?.type !== "debt")) return;
      const name = String(data.name ?? "").trim();
      const amount = String(data.amount ?? "").trim() ? Number(data.amount) : NaN;
      if (!name || !DEBT_DIRECTIONS.includes(data.direction) || !Number.isSafeInteger(amount) || amount < 0) {
        ui.notifications.warn(game.i18n.localize("OUW25.Debt.Invalid"));
        return;
      }
      const system = { direction: data.direction, location: String(data.location ?? "").trim(), amount };
      if (id) await actor.updateEmbeddedDocuments("Item", [{ _id: id, name, system }]);
      else await actor.createEmbeddedDocuments("Item", [{ type: "debt", name, system }]);
    } finally {
      this.#debtPending = false;
    }
  }

  static async deleteDebt(event, target) {
    const actor = this.actor;
    const id = target.dataset.debtId;
    if (!this.isEditable || actor.type !== "merchant" || this.#debtPending || actor.items.get(id)?.type !== "debt") return;
    this.#debtPending = true;
    try {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("OUW25.Debt.Delete") },
        content: `<p>${game.i18n.localize("OUW25.Debt.ConfirmDelete")}</p>`,
        rejectClose: false
      });
      if (confirmed && this.isEditable && actor.items.get(id)?.type === "debt") {
        await actor.deleteEmbeddedDocuments("Item", [id]);
      }
    } finally {
      this.#debtPending = false;
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
    const { key, resolve, labels, usesPast } = config;
    const previous = actor.system[field];
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
      if (actor.system[field] !== previous || (usesPast && actor.system.past !== past)) {
        ui.notifications.warn(i18n.localize("OUW25.Creation.Changed"));
        return;
      }
      const value = resolve(roll.total, past);
      await actor.update({ [`system.${field}`]: value });
      const result = labels ? i18n.localize(`${labels}.${value}`) : value;
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

  static async rollCollision(event, target) {
    if (!this.isEditable || this.actor.type !== "merchant" || target.disabled) return;
    const section = target.closest(".ouw25-collision");
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
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: game.i18n.format("OUW25.Collision.Result", {
          outcome: game.i18n.localize(`OUW25.Collision.${outcome}`),
          remaining
        })
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
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, Ouw25ActorSheet, {
    types: Object.keys(models),
    makeDefault: true,
    label: "OUW25.ActorSheet"
  });
});
