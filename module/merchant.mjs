export const MERCHANT_PASTS = [
  "unset", "veteran", "seeker", "colonist", "deprived", "savage", "reconstructed", "remnant",
  "augur", "gambler", "champion", "writer", "artist", "hard_worker", "sleeper", "defect", "slave"
];

export const MERCHANT_SPECIALTIES = ["unset", "quartermaster", "navigator", "medic", "mechanic"];

export function availableSpecialties(past) {
  if (past === "savage") return ["medic"];
  if (past === "hard_worker") return ["navigator", "mechanic"];
  return MERCHANT_SPECIALTIES.slice(1);
}

export function isSpecialtyAllowed(specialty, past) {
  return specialty === "unset" || availableSpecialties(past).includes(specialty);
}

export function specialtyFromRoll(total, past) {
  const choices = availableSpecialties(past);
  if (!Number.isInteger(total) || total < 1 || total > choices.length) throw new RangeError("Invalid specialty roll");
  return choices[total - 1];
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
