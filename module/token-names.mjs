const SYSTEM_ID = "ouw25";
const PENDING = "tokenNamePending";
const queues = new Map();

export function defaultTokenName(actor) {
  if (actor.type === "merchant") return actor.name;
  if (actor.type === "cooperative") return shipTokenName(actor.system?.shipName);
}

function shipTokenName(name) {
  if (typeof name !== "string" || !name) return name;
  return game.i18n.format("OUW25.Ship.TokenName", {
    prefix: game.i18n.localize("OUW25.Ship.Prefix"), name
  });
}

function sourceName(actor) {
  return actor.type === "cooperative" ? actor.system?.shipName : actor.name;
}

export function stageTokenNameUpdate(actor, changed) {
  if (actor.isToken || !["merchant", "cooperative"].includes(actor.type)) return;
  const shipName = changed["system.shipName"] ?? changed.system?.shipName;
  const renamed = actor.type === "merchant" ? changed.name !== undefined : shipName !== undefined;
  if (!renamed) return;
  const name = actor.type === "merchant" ? changed.name : shipTokenName(shipName);
  if (typeof name !== "string") return;
  changed.prototypeToken ??= {};
  changed.prototypeToken.name = name;
  if (renamed && !actor.pack) {
    changed.flags ??= {};
    changed.flags[SYSTEM_ID] ??= {};
    changed.flags[SYSTEM_ID][PENDING] = name;
  }
}

export function queueTokenNameSync(actor) {
  if (!game.user?.isActiveGM || actor.isToken || actor.pack || actor.getFlag(SYSTEM_ID, PENDING) === undefined) {
    return Promise.resolve();
  }
  const previous = queues.get(actor.uuid) ?? Promise.resolve();
  const current = previous.then(async () => {
    while (game.user?.isActiveGM) {
      const name = actor.getFlag(SYSTEM_ID, PENDING);
      if (name === undefined) return;
      const originalSourceName = sourceName(actor);
      for (const scene of game.scenes) {
        const updates = [...scene.tokens]
          .filter(token => token.actorLink && token.actorId === actor.id && token.name !== name)
          .map(token => ({ _id: token.id, name }));
        if (updates.length) {
          const updated = await scene.updateEmbeddedDocuments("Token", updates);
          if (!updated || updated.length !== updates.length) {
            throw new Error(`Failed to update token names in scene ${scene.id}`);
          }
        }
      }
      if (!game.user?.isActiveGM) return;
      if (actor.getFlag(SYSTEM_ID, PENDING) !== name) continue;
      if (!await actor.unsetFlag(SYSTEM_ID, PENDING)) throw new Error(`Failed to clear token name flag for ${actor.id}`);
      const currentName = actor.type === "cooperative" ? actor.prototypeToken?.name : actor.name;
      if (actor.getFlag(SYSTEM_ID, PENDING) === undefined && sourceName(actor) !== originalSourceName
        && typeof currentName === "string" && !await actor.setFlag(SYSTEM_ID, PENDING, currentName)) {
        throw new Error(`Failed to restore token name flag for ${actor.id}`);
      }
    }
  }).catch(error => {
    console.error("OUW25 | Token name synchronization failed", error);
    ui.notifications.error(game.i18n.localize("OUW25.SaveStatus.Error"));
  }).finally(() => {
    if (queues.get(actor.uuid) === current) queues.delete(actor.uuid);
  });
  queues.set(actor.uuid, current);
  return current;
}

export function syncPendingTokenNames() {
  if (!game.user?.isActiveGM) return;
  for (const actor of game.actors) {
    if (!actor.isToken && !actor.pack && actor.getFlag?.(SYSTEM_ID, PENDING) !== undefined) {
      queueTokenNameSync(actor);
    }
  }
}
