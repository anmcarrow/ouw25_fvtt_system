import { parseCollisionInput, resolveCollision } from "./collision.mjs";

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

class MerchantModel extends NotesModel {}
class CooperativeModel extends NotesModel {}

class Ouw25ActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["ouw25"],
    position: { width: 540 },
    actions: { rollCollision: Ouw25ActorSheet.rollCollision }
  };

  static PARTS = {
    notes: { template: `systems/${SYSTEM_ID}/templates/actor-notes.hbs` }
  };

  async _prepareContext(options) {
    return {
      ...await super._prepareContext(options),
      notes: this.actor.system.notes,
      actorTypeLabel: `TYPES.Actor.${this.actor.type}`,
      editable: this.isEditable,
      showCollision: this.isEditable && this.actor.type === "merchant"
    };
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
