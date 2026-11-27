const STARTER_SCENE = {
  name: "Set sail",
  navName: "Set sail",
  navigation: true,
  navOrder: 0,
  thumb: "systems/ouw25/styles/images/set-sail-thumb.webp",
  width: 3840,
  height: 2160,
  padding: 0.25,
  shiftX: 0,
  shiftY: 0,
  initial: { x: null, y: null, scale: null },
  initialLevel: "defaultLevel0000",
  grid: { type: 0, size: 100, style: "solidLines", thickness: 1, color: "#000000", alpha: 0.2, distance: 1, units: "" },
  tokenVision: true,
  fog: { mode: 1, colors: { explored: null, unexplored: null } },
  environment: {
    darknessLevel: 0,
    darknessLock: false,
    globalLight: {
      enabled: false, alpha: 0.5, bright: false, color: null, coloration: 1, luminosity: 0,
      saturation: 0, contrast: 0, shadows: 0, darkness: { min: 0, max: 1 }
    },
    cycle: true,
    base: { hue: 0, intensity: 0, luminosity: 0, saturation: 0, shadows: 0 },
    dark: { hue: 0.7138888888888889, intensity: 0, luminosity: -0.25, saturation: 0, shadows: 0 }
  },
  transition: { type: null, duration: 1500, activeOnly: false },
  levels: [{
    _id: "defaultLevel0000",
    name: "Level",
    elevation: { top: 4, bottom: 0 },
    background: { color: "#30045d", src: "systems/ouw25/styles/images/the_seah_bgr.webp", tint: "#ffffff", alphaThreshold: 0.75 },
    foreground: { src: null, tint: "#ffffff", alphaThreshold: 0.75 },
    fog: { src: null },
    textures: { anchorX: 0.5, anchorY: 0.5, offsetX: 0, offsetY: 0, fit: "fill", scaleX: 1, scaleY: 1, rotation: 0 },
    visibility: { levels: [] },
    sort: 0,
    flags: {}
  }],
  drawings: [],
  tokens: [],
  lights: [],
  notes: [],
  sounds: [],
  regions: [],
  tiles: [],
  walls: [],
  playlist: null,
  playlistSound: null,
  journal: null,
  journalEntryPage: null,
  weather: "",
  folder: null,
  sort: 0,
  ownership: { default: 2 },
  flags: {}
};

const EMBEDDED_TYPES = ["drawings", "tokens", "lights", "notes", "sounds", "regions", "tiles", "walls"];

function isEmptyWorld() {
  return ["actors", "scenes", "items", "journal"].every(key => game[key]?.size === 0);
}

export function initializeStarterScene() {
  if (!game.user?.isActiveGM || game.world?.playtime !== 0 || !isEmptyWorld()
    || game.settings.get("core", "nue.shownTips")) return;

  const tour = game.tours?.get("core.welcome");
  if (tour?.status === foundry.nue?.Tour?.STATUS?.UNSTARTED && tour?.status !== undefined) {
    const hook = Hooks.on("preCreateScene", (scene, _data, options, userId) => {
      if (scene.id !== "NUEDEFAULTSCENE0" || !options.keepId || userId !== game.user.id) return;
      Hooks.off("preCreateScene", hook);
      if (!isEmptyWorld()) return;
      try {
        const data = structuredClone(STARTER_SCENE);
        for (const key of EMBEDDED_TYPES) data[key] = foundry.data.operators.ForcedReplacement.create(data[key]);
        scene.updateSource(data);
      } catch (error) {
        reportStarterSceneError(error);
      }
    });
    return;
  }

  return Scene.create({ ...structuredClone(STARTER_SCENE), active: true }).catch(reportStarterSceneError);
}

function reportStarterSceneError(error) {
  console.error("OUW25 | Could not create the starter scene", error);
  ui.notifications.error(game.i18n.localize("OUW25.StarterSceneError"));
}
