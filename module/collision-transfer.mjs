const windows = new Map();

const key = (actor, type) => `${actor.uuid}:${type}`;

export function registerCollisionWindow(actor, type, receive) {
  const id = key(actor, type);
  const entry = { receive };
  windows.set(id, entry);
  return () => { if (windows.get(id) === entry) windows.delete(id); };
}

export async function transferCollision(actor, target, draft, open) {
  const existing = windows.get(key(actor, target));
  if (existing) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      classes: ["ouw25"], window: { title: game.i18n.localize("OUW25.Unluck.TransferTitle") },
      content: `<p>${game.i18n.localize("OUW25.Unluck.TransferConfirm")}</p>`, rejectClose: false
    });
    if (confirmed && windows.get(key(actor, target)) === existing) await existing.receive(draft);
    return;
  }
  void open(actor, draft).catch(error => {
    console.error("OUW25 | Collision transfer failed", error);
    ui.notifications.error(game.i18n.localize("OUW25.Unluck.Invalid"));
  });
}
