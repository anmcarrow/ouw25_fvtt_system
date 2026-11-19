export const MERCHANT_PASTS = [
  "unset", "veteran", "seeker", "colonist", "deprived", "savage", "reconstructed", "remnant",
  "augur", "gambler", "champion", "writer", "artist", "hard_worker", "sleeper", "defect", "slave"
];

export function lethalWoundSlot(past, fragile) {
  if (past === "artist" || (past === "deprived" && fragile)) return 2;
  return past === "hard_worker" ? 4 : 3;
}
