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
const SHIP_LAYOUT_FIELDS = [
  "shipClass", "holdBonus",
  ...Object.keys(SHIP_QUALITIES).flatMap(kind => SHIP_QUALITY_SLOTS.map(slot => `${kind}${slot}`)),
  ...SHIP_GEAR_SLOTS.map(slot => `gear${slot}`),
  ...Array.from({ length: SHIP_SLOT_COUNT }, (_, index) => `compartment${index + 1}`)
];

export function shipQualitySlots(ship, kind) {
  return selectionSlots(ship, kind, SHIP_QUALITY_SLOTS);
}

export function shipGearSlots(ship) {
  return selectionSlots(ship, "gear", SHIP_GEAR_SLOTS);
}

export function shipListDefinition(ship, kind) {
  const config = shipConfiguration(ship);
  const definitions = {
    merit: { slots: shipQualitySlots(ship, "merit"), choices: SHIP_QUALITIES.merit, labels: "OUW25.ShipQuality.Names", help: "OUW25.ShipQuality.Help", title: "OUW25.ShipQuality.merit.Title" },
    flaw: { slots: shipQualitySlots(ship, "flaw"), choices: SHIP_QUALITIES.flaw, labels: "OUW25.ShipQuality.Names", help: "OUW25.ShipQuality.Help", title: "OUW25.ShipQuality.flaw.Title" },
    mount: { slots: config.mounts, choices: MOUNT_CHOICES, labels: "OUW25.Ship.MountChoices", title: "OUW25.Ship.Mounts" },
    compartment: { slots: config.compartments, choices: Object.keys(COMPARTMENT_SPACE), labels: "OUW25.Ship.CompartmentChoices", title: "OUW25.Ship.Compartments" },
    gear: { slots: shipGearSlots(ship), choices: SHIP_GEAR_CHOICES, labels: "OUW25.ShipGear.Names", help: "OUW25.ShipGear.Help", title: "OUW25.ShipGear.Title" }
  };
  return Object.hasOwn(definitions, kind) ? definitions[kind] : undefined;
}

function selectionSlots(ship, kind, slots) {
  return slots.map(number => {
    const field = `${kind}${number}`;
    return { number, field, value: ship[field] ?? "none" };
  });
}

export function shipHold(ship, listedVolume, compartmentSpace) {
  const { shipClass, cargoLoad, fuelStock, provisionsStock, holdBonus } = ship;
  const largeHold = shipQualitySlots(ship, "merit").some(({ value }) => value === "large_hold");
  const capacity = SHIP_CLASS_STATS[shipClass].hold + (largeHold && HOLD_BONUSES.includes(holdBonus) ? holdBonus : 0);
  const occupied = (cargoLoad ?? 0) + listedVolume + (fuelStock ?? 0)
    + Math.ceil((provisionsStock ?? 0) / 18) + compartmentSpace;
  const free = capacity - occupied;
  return { capacity, occupied, nearFull: free >= 0 && free <= 100, overloaded: free < 0 };
}

export function shipSelectionError(ship, changes, listedVolume) {
  if (!SHIP_LAYOUT_FIELDS.some(field => Object.hasOwn(changes, field) && changes[field] !== ship[field])) return;
  const next = Object.assign(Object.fromEntries([...SHIP_LAYOUT_FIELDS, "cargoLoad", "fuelStock", "provisionsStock"]
    .map(field => [field, ship[field]])), changes);
  const slotGroups = [
    ...Object.keys(SHIP_QUALITIES).map(kind => [(state) => shipQualitySlots(state, kind), "OUW25.ShipQuality.Duplicates"]),
    [shipGearSlots, "OUW25.ShipGear.Duplicates"]
  ];
  for (const [slots, error] of slotGroups) {
    const before = slots(ship);
    const after = slots(next);
    for (const { field, value } of after) {
      if (value !== "none" && value !== ship[field]
        && after.filter(slot => slot.value === value).length > Math.max(1, before.filter(slot => slot.value === value).length)) {
        return error;
      }
    }
  }
  const beforeSpace = shipConfiguration(ship).compartmentSpace;
  const afterSpace = shipConfiguration(next).compartmentSpace;
  const beforeHold = shipHold(ship, listedVolume, beforeSpace);
  const afterHold = shipHold(next, listedVolume, afterSpace);
  if ((afterSpace > beforeSpace && afterHold.overloaded)
    || afterSpace - afterHold.capacity > Math.max(0, beforeSpace - beforeHold.capacity)) {
    return "OUW25.Ship.CompartmentDoesNotFit";
  }
}

export function normalizeUnrest(unrest, pending) {
  return { unrest: Math.floor(unrest), illuminationUnrestPending: pending ?? (unrest % 1 >= 0.5) };
}

export function hasWornEngine(ship) {
  return shipQualitySlots(ship, "flaw").some(({ value }) => value === "worn_engine");
}

export function resolveForcedMode(ship, successes) {
  const enabling = !ship.forcedMode;
  if (enabling && hasWornEngine(ship)) throw new RangeError("OUW25.Voyage.ForcedBlocked");
  const failed = successes <= 0;
  return {
    forcedMode: enabling && !failed,
    damageSlot: failed ? SHIP_DAMAGE_SLOTS.find(number => !ship[`damage${number}`]) : undefined
  };
}

export function calculateVoyage(ship) {
  const classStats = SHIP_CLASS_STATS[ship.shipClass];
  const crewCount = ship.crewCount;
  const crewBand = crewCount * 2 > classStats.crew ? "above-half"
    : crewCount * 2 === classStats.crew ? "half" : "below-half";
  const belowHalf = crewBand === "below-half";
  const wornEngine = hasWornEngine(ship);
  const forced = Boolean(ship.forcedMode) && !wornEngine;
  const fuelPerSector = classStats.fuel * (belowHalf ? 2 : 1) * (forced ? 2 : 1) * (ship.illuminationMode ? 2 : 1);
  let provisionsPerSector = classStats.provisions * (crewBand === "above-half" ? 1 : 0.5);
  if (forced && !belowHalf) provisionsPerSector *= 0.5;
  const fuelStock = ship.fuelStock;
  const provisionsStock = ship.provisionsStock;
  const unrest = Math.min(25, Math.max(
    shipQualitySlots(ship, "flaw").some(({ value }) => value === "cursed") ? 5 : 0,
    Math.floor(ship.unrest)
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
    unrestPerSector: ship.illuminationMode ? Number(Boolean(ship.illuminationUnrestPending)) : 1,
    fuelLow: fuelStock > 0 && fuelStock <= fuelPerSector * 5,
    fuelSectors: Math.floor(fuelStock / fuelPerSector),
    provisionsLow: provisionsStock > 0 && provisionsStock <= provisionsPerSector * ((forced ? 2 : 1) * (belowHalf ? 0.5 : 1)) * 5,
    travelBlocked: shortages.length > 0,
    shortages
  };
}

const TRANSITION_FIELDS = ["fuelStock", "provisionsStock", "unrest", "illuminationUnrestPending", "travelSectors", "travelWatches"];

function transitionState(ship) {
  const state = Object.fromEntries(TRANSITION_FIELDS.map(field => [field, ship[field]]));
  if (!Number.isSafeInteger(state.travelSectors) || state.travelSectors < 0
    || !Number.isFinite(state.travelWatches) || state.travelWatches < 0 || state.travelWatches > Number.MAX_SAFE_INTEGER
    || !Number.isFinite(state.fuelStock) || state.fuelStock < 0 || state.fuelStock > Number.MAX_SAFE_INTEGER
    || !Number.isFinite(state.provisionsStock) || state.provisionsStock < 0 || state.provisionsStock > Number.MAX_SAFE_INTEGER
    || !Number.isFinite(state.unrest) || state.unrest < 0 || state.unrest > 25) {
    throw new RangeError("OUW25.Voyage.InvalidState");
  }
  return { ...state, ...normalizeUnrest(state.unrest, state.illuminationUnrestPending) };
}

function readTransitionRecord(value) {
  let record;
  try {
    record = JSON.parse(value);
  } catch {
    throw new RangeError("OUW25.Voyage.InvalidTransition");
  }
  if (!record || record.version !== 1 || typeof record.id !== "string" || !record.id) {
    throw new RangeError("OUW25.Voyage.InvalidTransition");
  }
  const before = transitionState(record.before ?? {});
  const after = transitionState(record.after ?? {});
  const { costs } = record;
  if (!costs || ["fuel", "provisions", "unrest", "watches"].some(field =>
    !Number.isFinite(costs[field]) || costs[field] < 0 || costs[field] > Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("OUW25.Voyage.InvalidTransition");
  }
  return { ...record, before, after, costs: {
    ...costs, unrest: after.unrest - before.unrest
  } };
}

function validCounterReset(reset) {
  return reset && Number.isSafeInteger(reset.travelSectors) && reset.travelSectors >= 0
    && Number.isFinite(reset.travelWatches) && reset.travelWatches >= 0
    && reset.travelWatches <= Number.MAX_SAFE_INTEGER;
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
    illuminationUnrestPending: ship.illuminationMode ? !before.illuminationUnrestPending : before.illuminationUnrestPending,
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

export function prepareVoyageReset(ship) {
  const current = transitionState(ship);
  const update = { travelSectors: 0, travelWatches: 0 };
  if (!ship.lastTransition) return { update, rollbackPreserved: false };

  const record = readTransitionRecord(ship.lastTransition);
  const nonCounterFields = TRANSITION_FIELDS.filter(field => field !== "travelSectors" && field !== "travelWatches");
  const currentCountersMatchAfter = current.travelSectors === record.after.travelSectors
    && current.travelWatches === record.after.travelWatches;
  const currentCountersMatchReset = validCounterReset(record.counterReset)
    && current.travelSectors === record.counterReset.travelSectors
    && current.travelWatches === record.counterReset.travelWatches;
  if (nonCounterFields.some(field => current[field] !== record.after[field])
    || (!currentCountersMatchAfter && !currentCountersMatchReset)) {
    return { update, rollbackPreserved: false };
  }

  update.lastTransition = JSON.stringify({
    ...record,
    counterReset: { travelSectors: 0, travelWatches: 0 }
  });
  return { update, rollbackPreserved: true };
}

export function rollbackSectorTransition(ship) {
  const record = readTransitionRecord(ship.lastTransition);
  const { before, after, costs } = record;
  const current = transitionState(ship);
  const reset = record.counterReset;
  const counterReset = validCounterReset(reset);
  const fieldsToMatch = counterReset
    ? TRANSITION_FIELDS.filter(field => field !== "travelSectors" && field !== "travelWatches")
    : TRANSITION_FIELDS;
  if (fieldsToMatch.some(field => current[field] !== after[field])
    || (counterReset && (current.travelSectors !== reset.travelSectors
      || current.travelWatches !== reset.travelWatches))) {
    throw new RangeError("OUW25.Voyage.TransitionConflict");
  }
  return {
    ...before,
    ...(counterReset ? { travelSectors: reset.travelSectors, travelWatches: reset.travelWatches } : {}),
    lastTransition: "",
    costs: counterReset ? { ...costs, watches: 0 } : costs
  };
}

export function resolvePsychotherapy(unrest, successes, reliefDie) {
  if (!Number.isInteger(unrest) || unrest < 0 || unrest > 25
    || !Number.isSafeInteger(successes)
    || !Number.isSafeInteger(reliefDie) || reliefDie < 1 || reliefDie > 6) {
    throw new RangeError("OUW25.Voyage.InvalidState");
  }
  const possibleRelief = successes >= 2 ? reliefDie : successes === 1 ? Math.floor(reliefDie / 2) : 0;
  const relief = Math.min(unrest, possibleRelief);
  return { unrest: unrest - relief, relief };
}

export function prepareUnrestIncrease(unrest, gain) {
  if (!Number.isInteger(unrest) || unrest < 0 || unrest > 25
    || !Number.isSafeInteger(gain) || gain < 0) {
    throw new RangeError("OUW25.Voyage.InvalidState");
  }
  const nextUnrest = Math.min(25, unrest + gain);
  return { unrest: nextUnrest, increase: nextUnrest - unrest };
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
    compartmentSpace: compartments.reduce((sum, { value }) => sum + (COMPARTMENT_SPACE[value] ?? 0), 0)
  };
}
