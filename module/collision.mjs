function parseCount(value, min, max) {
  const text = String(value ?? "").trim();
  const count = Number(text);
  if (!/^(0|[1-9]\d*)$/.test(text) || !Number.isSafeInteger(count) || count < min || count > max) {
    throw new RangeError("Invalid collision input");
  }
  return count;
}

export function parseCollisionInput(dice, deduction) {
  return {
    diceCount: parseCount(dice, 4, 100),
    deduction: parseCount(deduction, 0, Number.MAX_SAFE_INTEGER)
  };
}

export function resolveCollision(dice, deduction) {
  const remaining = dice.filter(value => value === 6).length - deduction;
  return {
    remaining,
    outcome: remaining >= 2 ? "Success" : remaining === 1 ? "Partial" : "Failure"
  };
}

export function hasExcessSuccesses(remaining, partial) {
  return remaining > (partial ? 1 : 2);
}

export function calculateCheck(values) {
  const advantages = parseCount(values.advantages ?? 0, 0, 96);
  const complications = parseCount(values.complications ?? 0, 0, Number.MAX_SAFE_INTEGER);
  const wounds = parseCount(values.wounds ?? 0, 0, 4);
  const donations = parseCount(values.donations ?? 0, 0, 96);
  const luck = parseCount(values.luck ?? 0, 0, Number.MAX_SAFE_INTEGER);
  const { diceCount } = parseCollisionInput(4 + advantages + wounds + donations, complications);
  return { diceCount, deduction: complications, luck, donation: donations * 180 };
}

export function checkProbabilities(diceCount, deduction, luck = 0) {
  ({ diceCount, deduction } = parseCollisionInput(diceCount, deduction));
  luck = parseCount(luck, 0, Number.MAX_SAFE_INTEGER);
  if (diceCount > 15) return null;
  const probabilities = { Failure: 0, Partial: 0, Success: 0 };
  let probability = (5 / 6) ** diceCount;
  for (let sixes = 0; sixes <= diceCount; sixes++) {
    const remaining = sixes - deduction + luck;
    probabilities[remaining >= 2 ? "Success" : remaining === 1 ? "Partial" : "Failure"] += probability;
    probability *= (diceCount - sixes) / ((sixes + 1) * 5);
  }
  return probabilities;
}
