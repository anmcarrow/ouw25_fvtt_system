export function registerDiceTheme(dice3d) {
  const name = "ouw25-blessed-tide";
  const registration = dice3d.addColorset({
    name,
    description: "OUW25.DiceTheme",
    category: "OUW25.DiceTheme",
    foreground: "#edcd79",
    background: "#39185db3",
    outline: "none",
    edge: "#39185db3",
    texture: "none",
    material: "glass",
    font: "Viaoda Libre"
  });
  registration?.catch?.(error => console.error("OUW25 | Failed to load dice theme font", error));
  dice3d.addRole({
    id: "basic",
    defaults: { global: { colorset: name, font: "auto", material: "auto", texture: "none" } }
  }, { package: "ouw25" });
}
