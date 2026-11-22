const PORT_NAMES = [
  "Олъм", "Н`те Поа", "Салайф", "Костегрыз", "Сурга",
  "Глокрр", "Ррфэлрр", "Хэррн", "Кэррвн", "Пэнллн", "Гвэдус", "Кэллн",
  "Улфур", "Тллсин", "Эйллн", "Эрдду", "Кррф", "Кррк", "Ллэнб", "Эвнн",
  "Сланк", "Корара", "Те`Каинга", "Те`Ранга", "Те`Ароха", "Те`Роа",
  "Ра`Кау", "Н`Гамоту", "М`Катеа", "Тикароа", "Похуту", "Такора",
  "Тайнуи", "Мррфрр", "Манайа", "Квинф",
  "Кра`Кас", "Ра`Токо", "Джа`Тора", "Тата`Во", "Райма", "Пока",
  "Макарири", "Пьятата", "Пакару", "Вакаро", "Пури", "Таке-таке",
  "Кэфлэн", "Мадарах", "Куннд", "Окуйм", "Тихи", "Апарай", "Бэттн",
  "Вакапоко", "Орайа", "Кайта-Токора", "Маханга", "Пуаваи", "Райга-Кайора",
  "Кайва-Кайора", "Хур", "Та`Хот", "Бэссх", "Ррэф", "Ра`Хуа"
];

function normalizePortName(name) {
  return String(name ?? "").normalize("NFC").trim().toLowerCase()
    .replace(/ё/g, "е").replace(/['’ʼʻ‘´]/g, "`").replace(/\s+/g, " ");
}

const canonicalPorts = new Map(PORT_NAMES.map(name => [normalizePortName(name), name]));
canonicalPorts.set(normalizePortName("Пенллн"), "Пэнллн");

export const PORT_COUNT = PORT_NAMES.length;

export function discoveredPorts(names) {
  return new Set(names.map(name => canonicalPorts.get(normalizePortName(name))).filter(Boolean)).size;
}
