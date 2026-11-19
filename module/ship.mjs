export const MAX_SHIP_CLASS = 6;
export const SHIP_SLOT_COUNT = MAX_SHIP_CLASS + 2;
export const SHIP_CLASS_STATS = [
  { fuel: 1, provisions: 1, crew: 10, durability: 3, hold: 1600 },
  { fuel: 2, provisions: 1, crew: 15, durability: 4, hold: 3200 },
  { fuel: 2, provisions: 2, crew: 20, durability: 5, hold: 6400 },
  { fuel: 4, provisions: 2, crew: 25, durability: 6, hold: 12800 },
  { fuel: 4, provisions: 3, crew: 30, durability: 7, hold: 25200 },
  { fuel: 8, provisions: 3, crew: 35, durability: 8, hold: 50400 },
  { fuel: 10, provisions: 5, crew: 50, durability: 9, hold: 100000 }
];
export const MOUNT_CHOICES = ["none", "slagthrower", "harpoon", "water_cannon", "winch"];
export const COMPARTMENT_SPACE = { none: 0, passenger: 420, premium: 525, diving: 800 };
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
  const capacity = SHIP_CLASS_STATS[shipClass].hold + (largeHold && HOLD_BONUSES.includes(holdBonus) ? holdBonus : 0);
  const occupied = cargoLoad + listedVolume + fuelStock + Math.ceil(provisionsStock / 18) + compartmentSpace;
  const free = capacity - occupied;
  return { capacity, occupied, nearFull: free >= 0 && free <= 100, overloaded: free < 0 };
}

export function calculateVoyage(ship) {
  const classStats = SHIP_CLASS_STATS[ship.shipClass];
  const crewCount = ship.crewCount;
  const crewBand = crewCount * 2 > classStats.crew ? "above-half"
    : crewCount * 2 === classStats.crew ? "half" : "below-half";
  const belowHalf = crewBand === "below-half";
  const wornEngine = shipQualitySlots(ship, "flaw").some(({ value }) => value === "worn_engine");
  const forced = Boolean(ship.forcedMode) && !wornEngine;
  const fuelPerSector = classStats.fuel * (belowHalf ? 2 : 1) * (forced ? 2 : 1) * (ship.illuminationMode ? 2 : 1);
  let provisionsPerSector = classStats.provisions * (crewBand === "above-half" ? 1 : 0.5);
  if (forced && !belowHalf) provisionsPerSector *= 0.5;
  const fuelStock = ship.fuelStock;
  const provisionsStock = ship.provisionsStock;
  const unrest = Math.min(25, Math.max(
    shipQualitySlots(ship, "flaw").some(({ value }) => value === "cursed") ? 5 : 0,
    ship.unrest
  ));
  const shortages = [];
  if (crewCount === 0) shortages.push("OUW25.Voyage.NoCrew");
  if (fuelStock < fuelPerSector) shortages.push("OUW25.Voyage.FuelShortage");
  if (provisionsStock === 0) shortages.push("OUW25.Voyage.NoProvisions");
  else if (provisionsStock < provisionsPerSector) shortages.push("OUW25.Voyage.ProvisionsShortage");
  return {
    crewCapacity: classStats.crew,
    crewBand,
    crewBandLabel: `OUW25.Voyage.CrewBand.${crewBand}`,
    wornEngine,
    crewOverCapacity: crewCount > classStats.crew,
    speed: (forced ? 2 : 1) * (belowHalf ? 0.5 : 1),
    forced,
    forcedBlocked: Boolean(ship.forcedMode) && wornEngine,
    fuelPerSector,
    provisionsPerSector,
    unrest,
    unrestPerSector: ship.illuminationMode ? 0.5 : 1,
    fuelLow: fuelStock > 0 && fuelStock <= fuelPerSector * 5,
    fuelSectors: Math.floor(fuelStock / fuelPerSector),
    provisionsLow: provisionsStock > 0 && provisionsStock <= provisionsPerSector * ((forced ? 2 : 1) * (belowHalf ? 0.5 : 1)) * 5,
    travelBlocked: shortages.length > 0,
    shortages
  };
}

const TRANSITION_FIELDS = ["fuelStock", "provisionsStock", "unrest", "travelSectors", "travelWatches"];

function transitionState(ship) {
  const state = Object.fromEntries(TRANSITION_FIELDS.map(field => [field, ship[field]]));
  if (!Number.isSafeInteger(state.travelSectors) || state.travelSectors < 0
    || !Number.isFinite(state.travelWatches) || state.travelWatches < 0 || state.travelWatches > Number.MAX_SAFE_INTEGER
    || !Number.isFinite(state.fuelStock) || state.fuelStock < 0 || state.fuelStock > Number.MAX_SAFE_INTEGER
    || !Number.isFinite(state.provisionsStock) || state.provisionsStock < 0 || state.provisionsStock > Number.MAX_SAFE_INTEGER
    || !Number.isFinite(state.unrest) || state.unrest < 0 || state.unrest > 25) {
    throw new RangeError("OUW25.Voyage.InvalidState");
  }
  return state;
}

export function prepareSectorTransition(ship, id) {
  if (typeof id !== "string" || !id) throw new RangeError("OUW25.Voyage.InvalidState");
  const stats = calculateVoyage(ship);
  if (stats.travelBlocked) throw new RangeError("OUW25.Voyage.TransitionBlocked");
  const before = transitionState(ship);
  const after = {
    fuelStock: before.fuelStock - stats.fuelPerSector,
    provisionsStock: before.provisionsStock - stats.provisionsPerSector,
    unrest: stats.unrest + Math.min(stats.unrestPerSector, 25 - stats.unrest),
    travelSectors: before.travelSectors + 1,
    travelWatches: before.travelWatches + 1 / stats.speed
  };
  if (!Number.isSafeInteger(after.travelSectors) || !Number.isFinite(after.travelWatches)
    || after.travelSectors < 0 || after.travelWatches < 0 || after.travelWatches > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("OUW25.Voyage.InvalidState");
  }
  const costs = {
    fuel: stats.fuelPerSector,
    provisions: stats.provisionsPerSector,
    unrest: after.unrest - before.unrest,
    watches: after.travelWatches - before.travelWatches
  };
  const update = {
    ...after,
    lastTransition: JSON.stringify({ version: 1, id, before, after, costs })
  };
  return { update, costs };
}

export function rollbackSectorTransition(ship) {
  let record;
  try {
    record = JSON.parse(ship.lastTransition);
  } catch {
    throw new RangeError("OUW25.Voyage.InvalidTransition");
  }
  if (!record || record.version !== 1 || typeof record.id !== "string" || !record.id) {
    throw new RangeError("OUW25.Voyage.InvalidTransition");
  }
  const before = transitionState(record.before ?? {});
  const after = transitionState(record.after ?? {});
  const current = transitionState(ship);
  if (TRANSITION_FIELDS.some(field => current[field] !== after[field])) {
    throw new RangeError("OUW25.Voyage.TransitionConflict");
  }
  const { costs } = record;
  if (!costs || ["fuel", "provisions", "unrest", "watches"].some(field =>
    !Number.isFinite(costs[field]) || costs[field] < 0 || costs[field] > Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("OUW25.Voyage.InvalidTransition");
  }
  return { ...before, lastTransition: "", costs };
}

export function shipCondition(ship) {
  const strongHull = shipQualitySlots(ship, "merit").some(({ value }) => value === "strong_hull");
  const durability = SHIP_CLASS_STATS[ship.shipClass].durability + (strongHull ? 2 : 0);
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
