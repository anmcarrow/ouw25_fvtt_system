import { MERCHANT_TRAITS } from "./traits.mjs";

export function hasTraitPair(actor, system = actor.system) {
  const codes = [system?.merit, system?.flaw,
    ...Array.from(actor.items ?? []).filter(item => item.type === "trait").map(item => item.system.code)];
  return ["merit", "flaw"].every(kind => codes.some(code => MERCHANT_TRAITS[kind].includes(code)));
}

export function isPastLocked(actor) {
  return Boolean(actor.system?.pastLocked || hasTraitPair(actor));
}

export async function founderActor(uuid, user = game.user) {
  let actor;
  try { actor = await fromUuid(uuid); } catch { return null; }
  return actor?.type === "merchant" && actor.testUserPermission(user, "OBSERVER") ? actor : null;
}

export async function findEligibleCaptain(founders, user = game.user) {
  for (const uuid of founders ?? []) {
    const actor = await founderActor(uuid, user);
    if (!actor) {
      if (!user.isGM) return { actor: null, unknown: true };
      continue;
    }
    if (actor.system.past !== "slave") return { actor, unknown: false };
  }
  return { actor: null, unknown: false };
}

export async function firstEligibleCaptain(founders, user = game.user) {
  return (await findEligibleCaptain(founders, user)).actor;
}

export async function resolveCaptain(cooperative, user = game.user) {
  const founders = cooperative?.system?.founders ?? [];
  const uuid = cooperative?.system?.captain;
  if (uuid && founders.includes(uuid)) {
    const actor = await founderActor(uuid, user);
    if (!actor || actor.system.past !== "slave") return { uuid, actor };
  }
  const { actor, unknown } = await findEligibleCaptain(founders, user);
  return { uuid: actor?.uuid ?? null, actor, unknown };
}

export async function reconcileCaptain(cooperative) {
  const founders = [...(cooperative.system.founders ?? [])];
  const previousUuid = cooperative.system.captain ?? null;
  const current = previousUuid && founders.includes(previousUuid) ? await founderActor(previousUuid) : null;
  if (current && current.system.past !== "slave") return;
  const next = await firstEligibleCaptain(founders);
  if ((next?.uuid ?? null) === previousUuid) return;
  if ((cooperative.system.captain ?? null) !== previousUuid
    || JSON.stringify(cooperative.system.founders ?? []) !== JSON.stringify(founders)) return;
  const previous = previousUuid ? await founderActor(previousUuid) : null;
  if ((cooperative.system.captain ?? null) !== previousUuid
    || JSON.stringify(cooperative.system.founders ?? []) !== JSON.stringify(founders)) return;
  await cooperative.update({ "system.captain": next?.uuid ?? null });
  if ((cooperative.system.captain ?? null) !== (next?.uuid ?? null)) {
    throw new Error("Captain update failed");
  }
  if (previousUuid) await publishCaptainChange(cooperative, previous, next, { previousUnknown: !previous });
}

export async function publishCaptainChange(cooperative, previous, next, { previousUnknown = false } = {}) {
  try {
    const { ChatMessage } = foundry.documents;
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/ouw25/templates/captain-card.hbs", {
        cooperative: cooperative.name,
        previous: previous?.name ?? game.i18n.localize(previousUnknown
          ? "OUW25.Founders.UnknownCaptain" : "OUW25.Founders.NoCaptain"),
        next: next?.name ?? game.i18n.localize("OUW25.Founders.NoCaptain")
      }
    );
    const message = { speaker: ChatMessage.getSpeaker({ actor: cooperative }), content };
    const mode = game.settings.get("core", "messageMode");
    ChatMessage.applyMode(message, mode);
    const allowed = Array.from(game.users).filter(user => user.isGM ||
      [cooperative, previous, next].filter(Boolean).every(actor => actor.testUserPermission(user, "OBSERVER")))
      .map(user => user.id);
    message.whisper = ["public", "ic", "publicroll", "roll"].includes(mode)
      ? allowed : (message.whisper ?? []).filter(id => allowed.includes(id));
    if (!message.whisper.length) throw new Error("No authorized captain message recipients");
    await ChatMessage.create(message);
  } catch (error) {
    console.error("OUW25 | Captain change chat failed", error);
    ui.notifications.error(game.i18n.localize("OUW25.Founders.ChatFailed"));
  }
}
