function count(value) {
  const text = String(value ?? "0").trim();
  const number = Number(text);
  if (!/^(0|[1-9]\d*)$/.test(text) || !Number.isSafeInteger(number)) throw new RangeError("Invalid bargain input");
  return number;
}

export function calculateBargain(values) {
  const advantages = count(values.advantages);
  const complications = count(values.complications);
  const traits = count(values.traits);
  const captainTraits = count(values.captainTraits);
  const time = count(values.time);
  const unrest = count(values.unrest);
  const cash = count(values.cash);
  const budget = count(values.budget);
  const loan = count(values.loan);
  const enemies = count(values.enemies);
  const friends = count(values.friends);
  const neutralized = Math.min(complications, Math.floor(advantages / 4));
  const remainingAdvantages = advantages - neutralized * 4;
  const fullPrice = 2 + (complications - neutralized) * (values.inflation ? 1 : 2);
  const price = values.partial ? (values.inflation ? Math.floor(fullPrice / 2) : fullPrice - 1) : fullPrice;
  const unitCost = 3000 * traits;
  const loanCost = 5000 * captainTraits;
  const money = cash + budget;
  if (![fullPrice, unitCost, loanCost, money].every(Number.isSafeInteger)) throw new RangeError("Invalid bargain input");
  if ((!traits && money) || (!captainTraits && loan)) throw new RangeError("Missing traits");
  const contributions = {
    advantages: Math.floor(remainingAdvantages / (values.inflation ? 8 : 12)),
    time, unrest, money: unitCost ? Math.floor(money / unitCost) : 0,
    loan: loanCost ? Math.floor(loan / loanCost) : 0,
    enemies: enemies * 3, friends: friends * 4
  };
  const paid = Object.values(contributions).reduce((sum, value) => sum + value, 0);
  if (![paid, unrest * 8, enemies * 3, friends * 4].every(Number.isSafeInteger)) throw new RangeError("Invalid bargain input");
  return { neutralized, spentAdvantages: neutralized * 4, remainingAdvantages, fullPrice, price,
    unitCost, loanCost, contributions, paid, remaining: Math.max(0, price - paid), excess: Math.max(0, paid - price) };
}
