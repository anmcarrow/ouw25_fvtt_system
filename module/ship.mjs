export const MAX_SHIP_CLASS = 6;
export const SHIP_SLOT_COUNT = MAX_SHIP_CLASS + 2;
export const MOUNT_CHOICES = ["none", "slagthrower", "harpoon", "water_cannon", "winch"];
export const COMPARTMENT_SPACE = { none: 0, passenger: 420, premium: 525, diving: 800 };
const HOLD_CAPACITY = [1600, 3200, 6400, 12800, 25200, 50400, 100000];
export const SHIP_QUALITY_SLOTS = [1, 2, 3, 4];
export const SHIP_QUALITIES = {
  merit: ["none", "large_hold", "unremarkable", "quiet", "low_profile", "strong_hull", "seaworthy"],
  flaw: ["none", "clumsy", "cursed", "worn_hull", "worn_engine", "stolen", "vermin"]
};
export const HOLD_BONUSES = [0, 100, 200, 300, 400, 500, 600];
export const SHIP_GEAR_CHOICES = ["none", "sandshoes", "tow"];
export const SHIP_GEAR_SLOTS = [1, 2];
export const SHIP_DAMAGE_SLOTS = Array.from({ length: MAX_SHIP_CLASS + 5 }, (_, i) => i + 1);

export function shipQualitySlots(ship, kind) {
  return SHIP_QUALITY_SLOTS.map(number => {
    const field = `${kind}${number}`;
    return { number, field, value: ship[field] ?? "none" };
  });
}

export function shipHold(ship, listedVolume, compartmentSpace) {
  const { shipClass, cargoLoad, fuelStock, provisionsStock, holdBonus } = ship;
  const largeHold = shipQualitySlots(ship, "merit").some(({ value }) => value === "large_hold");
  const capacity = HOLD_CAPACITY[shipClass] + (largeHold && HOLD_BONUSES.includes(holdBonus) ? holdBonus : 0);
  const occupied = cargoLoad + listedVolume + fuelStock + Math.ceil(provisionsStock / 18) + compartmentSpace;
  const free = capacity - occupied;
  return { capacity, occupied, nearFull: free >= 0 && free <= 100, overloaded: free < 0 };
}

export function shipCondition(ship) {
  const strongHull = shipQualitySlots(ship, "merit").some(({ value }) => value === "strong_hull");
  const durability = ship.shipClass + 3 + (strongHull ? 2 : 0);
  const slots = SHIP_DAMAGE_SLOTS.map(number => ({
    number, marked: Boolean(ship[`damage${number}`]), beyondLimit: number > durability
  }));
  const damaged = slots.filter(({ marked }) => marked).length;
  return {
    durability, damaged, overLimit: damaged > durability,
    slots: slots.filter(({ marked, beyondLimit }) => marked || !beyondLimit)
  };
}

export function shipConfiguration(ship) {
  const slots = (prefix, count) => Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const field = `${prefix}${number}`;
    return { number, field, value: ship[field] };
  });
  const mounts = slots("mount", ship.shipClass + 2);
  const compartments = slots("compartment", Math.max(4, ship.shipClass + 2));
  return {
    mounts,
    compartments,
    freeMounts: mounts.filter(({ value }) => value === "none").length,
    compartmentSpace: compartments.reduce((sum, { value }) => sum + COMPARTMENT_SPACE[value], 0)
  };
}
