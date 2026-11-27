export const MERCHANT_PASTS = [
  "unset", "veteran", "seeker", "colonist", "deprived", "savage", "reconstructed", "remnant",
  "augur", "gambler", "champion", "writer", "artist", "hard_worker", "sleeper", "defect", "slave"
];

export const MERCHANT_SPECIALTIES = ["unset", "quartermaster", "navigator", "medic", "mechanic"];

export const MERCHANT_HIRING = [
  "unset", "dance", "tale", "bar", "checkers", "pitiful", "letters", "bomb", "punctual", "kerwetka", "ate", "charming"
];

const GIVEN_NAMES = [
  "Абгейл", "Апстам", "Крун", "Рргина", "Уррн", "Алррн", "Диллс", "Кнни",
  "Пллис", "Пттр", "Гйдрр", "Кэдок", "Флетт", "Рртис", "Афн"
];
const SURNAMES = [
  "Глоф", "Глох", "Нинбррн", "Эйк", "Манч", "Хим", "Акром", "Соррк",
  "Йббни", "Инвтн", "Лигор", "Пьерс", "Йлл", "Матон", "Бррлин"
];
const EN_GIVEN_NAMES = [
  "Abgeyl", "Apstam", "Krun", "Rrgina", "Urrn", "Alrrn", "Dills", "Knni",
  "Pllis", "Pttr", "Gydrr", "Kedok", "Flett", "Rrtis", "Afn"
];
const EN_SURNAMES = [
  "Glof", "Glokh", "Ninbrrn", "Eyk", "Manch", "Khim", "Akrom", "Sorrk",
  "Ybbni", "Invtn", "Ligor", "Pyers", "Yll", "Maton", "Brrlin"
];

function validateFace(value, max) {
  if (!Number.isInteger(value) || value < 1 || value > max) throw new RangeError(`Invalid d${max} result`);
  return value;
}

export function merchantNameFromRolls(given, surname, language = "ru") {
  const givenNames = language === "en" ? EN_GIVEN_NAMES : GIVEN_NAMES;
  const surnames = language === "en" ? EN_SURNAMES : SURNAMES;
  return `${givenNames[validateFace(given, 15) - 1]} ${surnames[validateFace(surname, 15) - 1]}`;
}

export function dreamFromRoll(total) {
  return validateFace(total, 10);
}

export function hiringFromRoll(total) {
  return MERCHANT_HIRING[validateFace(total, 11)];
}

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
