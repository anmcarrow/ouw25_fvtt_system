const chance = (id, threshold = 1) => ({ id, formula: "1d6", threshold });
const table = (id, extra = {}) => ({ id, formula: "1d6", table: true, extra });
const amount = (id, formula) => ({ id, formula });
const collision = id => ({ id, collision: true });
const supplies = { id: "supplies", supplies: true };

const PAST_ACTIONS = {
  veteran: [collision("comrade"), chance("favor"), table("honor")],
  seeker: [table("schemes")],
  colonist: [chance("discount"), supplies, table("city")],
  deprived: [chance("trouble")],
  savage: [supplies, chance("etiquette")],
  reconstructed: [chance("customs"), chance("accomplice"), table("offer"), amount("delay", "2d6")],
  remnant: [table("accident")],
  augur: [collision("divination")],
  gambler: [chance("bet", 3), chance("debt"), table("debtor", {
    1: { amount: "1d6*100" }, 2: { amount: "1d6*1000" }, 3: { amount: "1d6*100" },
    4: { amount: "1d6*1000", guards: "2d6" }, 5: { payment: "4d6*1000", debt: "4d6*1000" }
  })],
  champion: [chance("glory", 3), chance("challenge"), chance("admirer"), table("flirt", {
    4: { amount: "1d6*1000" }, 5: { amount: "1d6*1000" }, 6: { amount: "1d6*1000" }
  })],
  writer: [chance("inspection", 3), chance("outing"), table("wakeup")],
  artist: [chance("fan"), chance("rival"), chance("critic", 2)],
  sleeper: [chance("vanish"), table("return")],
  defect: [chance("contact", 2), chance("owed"), table("service"), chance("revenge", 3)]
};
const HIRING_ACTIONS = {
  tale: [amount("tale", "1d6*1000")],
  pitiful: [amount("fund", "1d6*500")],
  ate: [chance("poison", 3)]
};

export function personalActions(source, value) {
  const actions = source === "past" ? PAST_ACTIONS : source === "hiring" ? HIRING_ACTIONS : null;
  return actions && Object.hasOwn(actions, value) ? actions[value] : [];
}

export function provisionFormula(successes) {
  const count = Number(successes);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new RangeError("Invalid success count");
  return `${2 * count}d6`;
}

export function personalOutcome(action, total) {
  const prefix = `OUW25.PersonalAction.Moves.${action.id}`;
  if (action.table || action.threshold !== undefined) {
    if (!Number.isInteger(total) || total < 1 || total > 6) throw new RangeError("Invalid d6 result");
    const outcome = action.table ? total : total <= action.threshold ? "yes" : "no";
    return { key: `${prefix}.${outcome}`, extra: action.extra?.[total] ?? {} };
  }
  return { key: `${prefix}.result`, data: { total }, extra: {} };
}
