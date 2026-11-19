export const MERCHANT_PASTS = [
  "unset", "veteran", "seeker", "colonist", "deprived", "savage", "reconstructed", "remnant",
  "augur", "gambler", "champion", "writer", "artist", "hard_worker", "sleeper", "defect", "slave"
];

export const MERCHANT_SPECIALTIES = ["unset", "quartermaster", "navigator", "medic", "mechanic"];

export function specialtyFromRoll(total) {
  if (!Number.isInteger(total) || total < 1 || total > 4) throw new RangeError("Invalid 1d4 total");
  return MERCHANT_SPECIALTIES[total];
}

export function lethalWoundSlot(past, fragile) {
  if (past === "artist" || (past === "deprived" && fragile)) return 2;
  return past === "hard_worker" ? 4 : 3;
}

export function pastFromRoll(total) {
  if (!Number.isInteger(total) || total < 3 || total > 18) throw new RangeError("Invalid 3d6 total");
  return MERCHANT_PASTS[total - 2];
}

export function startingPocketMoney(total, past) {
  if (!Number.isInteger(total) || total < 4 || total > 24) throw new RangeError("Invalid 4d6 total");
  return total * (past === "deprived" ? 50 : past === "slave" ? 0 : 10);
}
