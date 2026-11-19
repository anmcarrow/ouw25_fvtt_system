import { parseCollisionInput, resolveCollision } from "./collision.mjs";
import { pensionBalanceAfterDeposit, pensionProgress } from "./finance.mjs";

const SYSTEM_ID = "ouw25";
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

class NotesModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      notes: new foundry.data.fields.StringField({ initial: "" })
    };
  }
}

function moneyField() {
  return new foundry.data.fields.NumberField({
    required: true, nullable: false, initial: 0, integer: true, min: 0, max: Number.MAX_SAFE_INTEGER
  });
}

class MerchantModel extends NotesModel {
  static defineSchema() {
    return { ...super.defineSchema(), pocketMoney: moneyField(), pensionBalance: moneyField() };
  }
}

class CooperativeModel extends NotesModel {
  static defineSchema() {
    return { ...super.defineSchema(), budget: moneyField() };
  }
}

class Ouw25ActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  #depositPending = false;

  static DEFAULT_OPTIONS = {
    classes: ["ouw25"],
    position: { width: 540 },
    actions: { rollCollision: Ouw25ActorSheet.rollCollision, depositPension: Ouw25ActorSheet.depositPension }
  };

  static PARTS = {
    notes: { template: `systems/${SYSTEM_ID}/templates/actor-notes.hbs` }
  };

  async _prepareContext(options) {
    const { type, system } = this.actor;
    const merchant = type === "merchant";
    const pension = merchant ? pensionProgress(system.pensionBalance) : null;
    return {
      ...await super._prepareContext(options),
      notes: system.notes,
      actorTypeLabel: `TYPES.Actor.${type}`,
      editable: this.isEditable,
      showCollision: this.isEditable && merchant,
      money: merchant ? { value: system.pocketMoney, field: "pocketMoney", label: "OUW25.Finance.PocketMoney" }
        : { value: system.budget, field: "budget", label: "OUW25.Finance.Budget" },
      pension: pension && { balance: system.pensionBalance, ...pension, complete: pension.untilNext === null }
    };
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
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, Ouw25ActorSheet, {
    types: Object.keys(models),
    makeDefault: true,
    label: "OUW25.ActorSheet"
  });
});
