const FIELDS = [
  ["fuelStock", "Fuel"], ["provisionsStock", "Provisions"], ["unrest", "Unrest"],
  ["travelSectors", "Sectors"], ["travelWatches", "Watches"]
];

export function voyageCardData(actor, before, after, undo) {
  return {
    title: `OUW25.Voyage.${undo ? "UndoSector" : "TravelSector"}`,
    actorName: actor.name,
    shipName: actor.system.shipName,
    fields: FIELDS.map(([field, label]) => ({
      label: `OUW25.Voyage.Card${label}`,
      before: before[field],
      after: after[field],
      delta: after[field] - before[field],
      positive: after[field] > before[field]
    }))
  };
}

export function restrictVoyageRecipients(message, users, actor, mode = "public") {
  const allowed = new Set(users.filter(user => user.isGM || actor.testUserPermission(user, "OBSERVER")).map(user => user.id));
  const recipients = ["public", "ic", "publicroll", "roll"].includes(mode)
    ? [...allowed] : (message.whisper ?? []).filter(id => allowed.has(id));
  if (!recipients.length) throw new Error("No authorized voyage message recipients");
  message.whisper = recipients;
}

export async function publishVoyageCard(actor, before, after, undo) {
  try {
    const { ChatMessage } = foundry.documents;
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/ouw25/templates/voyage-card.hbs", voyageCardData(actor, before, after, undo)
    );
    const message = { speaker: ChatMessage.getSpeaker({ actor }), content };
    const mode = game.settings.get("core", "messageMode");
    ChatMessage.applyMode(message, mode);
    restrictVoyageRecipients(message, Array.from(game.users), actor, mode);
    await ChatMessage.create(message);
  } catch (error) {
    console.error(error);
    ui.notifications.error(game.i18n.localize("OUW25.Voyage.CardFailedApplied"));
  }
}
