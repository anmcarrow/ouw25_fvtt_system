import { lethalWoundSlot } from "./merchant.mjs";

function eligible(actor, type, permission) {
  return actor?.documentName === "Actor" && actor.type === type
    && game.actors.get(actor.id) === actor && actor.testUserPermission(game.user, permission);
}

export function checkCostSnapshot(leader, cooperative) {
  const lethal = lethalWoundSlot(leader.system.past, leader.system.fragile);
  return {
    luck: leader.system.luck, cash: leader.system.pocketMoney,
    wounds: Array.from({ length: lethal }, (_, index) => Boolean(leader.system[`wound${index + 1}`])),
    past: leader.system.past, fragile: leader.system.fragile,
    budget: cooperative?.system.budget
  };
}

export function checkCostUpdates(leader, cooperative, snapshot, values) {
  const { luck, donation, source, wounds } = values;
  if (!eligible(leader, "merchant", "OBSERVER") || !Number.isSafeInteger(luck) || luck < 0
    || !Number.isSafeInteger(donation) || donation < 0 || !Array.isArray(wounds)
    || new Set(wounds).size !== wounds.length) throw new Error("changed");
  if ((luck || donation && source === "cash" || wounds.length) && !eligible(leader, "merchant", "OWNER")) throw new Error("changed");
  if (luck && (leader.system.luck !== snapshot.luck || luck > snapshot.luck)) throw new Error("changed");
  if (wounds.length && (leader.system.past !== snapshot.past || leader.system.fragile !== snapshot.fragile
    || wounds.some(slot => !Number.isInteger(slot) || slot < 1 || slot > snapshot.wounds.length
      || snapshot.wounds[slot - 1] || leader.system[`wound${slot}`]))) throw new Error("changed");
  const leaderUpdate = { _id: leader.id };
  if (luck) leaderUpdate["system.luck"] = snapshot.luck - luck;
  for (const slot of wounds) leaderUpdate[`system.wound${slot}`] = true;
  if (donation && source === "cash") {
    if (leader.system.pocketMoney !== snapshot.cash || donation > snapshot.cash) throw new Error("changed");
    leaderUpdate["system.pocketMoney"] = snapshot.cash - donation;
  } else if (donation && source !== "budget") throw new Error("changed");
  const updates = Object.keys(leaderUpdate).length > 1 ? [leaderUpdate] : [];
  if (donation && source === "budget") {
    if (!eligible(cooperative, "cooperative", "OWNER") || cooperative.system.budget !== snapshot.budget
      || donation > snapshot.budget) throw new Error("changed");
    updates.push({ _id: cooperative.id, "system.budget": snapshot.budget - donation });
  }
  return updates;
}

export async function applyCheckCosts(leader, cooperative, snapshot, values) {
  const updates = checkCostUpdates(leader, cooperative, snapshot, values);
  if (!updates.length) return;
  await foundry.documents.Actor.updateDocuments(updates);
  for (const update of updates) {
    const actor = update._id === leader.id ? leader : cooperative;
    for (const [key, value] of Object.entries(update)) {
      if (key !== "_id" && actor.system[key.slice(7)] !== value) throw new Error("Partial check costs");
    }
  }
}
