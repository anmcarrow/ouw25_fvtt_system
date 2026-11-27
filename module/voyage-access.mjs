export function hasVoyageRole(cooperative, founders, user, role) {
  if (!["captain", "mechanic", "medic"].includes(role) || !user) return false;
  if (user.isGM) return true;
  const memberUuids = cooperative.system.founders ?? [];
  return founders.some(actor => {
    if (actor?.type !== "merchant" || !memberUuids.includes(actor.uuid)
      || !actor.testUserPermission(user, "OWNER")) return false;
    return role === "captain"
      ? cooperative.system.captain === actor.uuid && actor.system.past !== "slave"
      : actor.system.specialty === role;
  });
}

export async function canOperateVoyage(cooperative, user, role) {
  if (!["captain", "mechanic", "medic"].includes(role) || !user) return false;
  if (user.isGM) return true;
  const uuids = role === "captain"
    ? [cooperative.system.captain].filter(Boolean)
    : [...(cooperative.system.founders ?? [])];
  const founders = await Promise.all(uuids.map(async uuid => {
    try { return await fromUuid(uuid); } catch { return null; }
  }));
  return hasVoyageRole(cooperative, founders, user, role);
}
