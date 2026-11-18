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
