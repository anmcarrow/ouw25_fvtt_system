export const MERCHANT_TRAITS = Object.freeze({
  merit: Object.freeze([
    "stress_resistant", "erudite", "charismatic", "connections", "famous", "agile", "strong", "taste",
    "manners", "trader", "prepared", "buoyant", "stealthy", "enduring", "intuitive", "empathetic"
  ]),
  flaw: Object.freeze([
    "addiction", "cruel", "apathetic", "schizophrenia", "paranoid", "greedy", "sex_addiction", "distracted",
    "overconfident", "unhealthy", "injury", "forgetful", "insensitive", "indecisive", "kleptomaniac", "notoriety"
  ])
});

export function traitFromRoll(kind, total) {
  if (!Object.hasOwn(MERCHANT_TRAITS, kind) || !Number.isInteger(total) || total < 3 || total > 18) {
    throw new RangeError("Invalid trait roll");
  }
  return MERCHANT_TRAITS[kind][total - 3];
}
