import { SHIP_CLASS_STATS } from "./ship.mjs";

export function voyageAlertStates(system) {
  const capacity = SHIP_CLASS_STATS[system.shipClass]?.crew;
  return {
    strainHigh: system.unrest > 20,
    strainMax: system.unrest >= 25,
    crewLow: Number.isFinite(capacity) && system.crewCount * 2 < capacity,
    crewEmpty: system.crewCount === 0
  };
}

export function voyageAlertCrossings(before, after) {
  const previous = voyageAlertStates(before);
  const current = voyageAlertStates(after);
  return Object.keys(current)
    .filter(key => previous[key] !== current[key])
    .map(key => ({ key: `OUW25.Voyage.Alert.${key}.${current[key] ? "entered" : "left"}` }));
}

export function stageVoyageAlert(actor, changes, options) {
  if (actor.type !== "cooperative" || actor.pack) return;
  if (!["unrest", "crewCount", "shipClass"].some(key =>
    Object.hasOwn(changes.system ?? {}, key) || Object.hasOwn(changes, `system.${key}`))) return;
  options.ouw25VoyageAlertBefore ??= {};
  options.ouw25VoyageAlertBefore[actor.uuid] = {
    unrest: actor.system.unrest, crewCount: actor.system.crewCount, shipClass: actor.system.shipClass
  };
}

export async function publishVoyageAlerts(actor, options = {}, userId) {
  if (actor.type !== "cooperative" || !game.user?.id || userId !== game.user.id) return;
  const before = options.ouw25VoyageAlertBefore?.[actor.uuid];
  if (!before) return;
  delete options.ouw25VoyageAlertBefore[actor.uuid];
  const crossings = voyageAlertCrossings(before, actor.system);
  if (!crossings.length) return;
  try {
    const { ChatMessage } = foundry.documents;
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/ouw25/templates/voyage-alert-card.hbs", { actorName: actor.name, crossings }
    );
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
  } catch (error) {
    console.error("OUW25 | Could not publish voyage alerts", error);
    ui.notifications.error(game.i18n.localize("OUW25.Voyage.Alert.ChatFailed"));
  }
}
