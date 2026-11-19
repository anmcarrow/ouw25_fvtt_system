export const MAX_SHIP_CLASS = 6;
export const SHIP_SLOT_COUNT = MAX_SHIP_CLASS + 2;
export const MOUNT_CHOICES = ["none", "slagthrower", "harpoon", "water_cannon", "winch"];
export const COMPARTMENT_SPACE = { none: 0, passenger: 420, premium: 525, diving: 800 };

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
