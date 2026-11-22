import { parseCollisionInput } from "./collision.mjs";

export const ASSISTANT_BONUSES = [
  "specialty", "merit", "shipMerit", "pastReputation", "preparation", "circumstances", "wounds", "donation"
];
export const ASSISTANT_COMPLICATIONS = [
  "equipment", "personalFlaws", "shipCrewFlaws", "opponents", "interference", "planChanges", "other"
];

function count(value) {
  const text = String(value ?? "0").trim();
  const number = Number(text);
  if (!/^(0|[1-9]\d*)$/.test(text) || !Number.isSafeInteger(number)) throw new RangeError("Invalid assistant input");
  return number;
}

export function calculateCollisionAssistant(values) {
  const bonuses = Object.fromEntries(ASSISTANT_BONUSES.map(key => [key, count(values[key])]));
  const complications = Object.fromEntries(ASSISTANT_COMPLICATIONS.map(key => [key, count(values[key])]));
  if (bonuses.specialty > 1 || bonuses.shipMerit > 1 || complications.equipment > 1) {
    throw new RangeError("Invalid assistant input");
  }
  const diceCount = 4 + Object.entries(bonuses).reduce((sum, [key, value]) =>
    sum + (key === "donation" ? Math.floor(value / 180) : value), 0) + (values.dream ? 4 : 0);
  const deduction = Object.values(complications).reduce((sum, value) => sum + value, 0);
  const result = parseCollisionInput(diceCount, deduction);
  const details = [
    ...ASSISTANT_BONUSES.filter(key => bonuses[key]).map(key => ({
      label: `OUW25.CheckAssistant.Bonus.${key}`, value: bonuses[key]
    })),
    ...(values.dream ? [{ label: "OUW25.CheckAssistant.Dream", value: 4 }] : []),
    ...ASSISTANT_COMPLICATIONS.filter(key => complications[key]).map(key => ({
      label: `OUW25.CheckAssistant.Penalty.${key}`, value: complications[key]
    }))
  ];
  return { ...result, details };
}
