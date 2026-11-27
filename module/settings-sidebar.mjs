export function renderSystemInfo(html) {
  const info = html.querySelector(".info");
  const system = info?.querySelector(".system");
  const version = system?.querySelector(".value");
  if (!info || !system || !version || html.querySelector(".ouw25-settings-info")) return;

  const document = html.ownerDocument;
  const section = document.createElement("section");
  section.className = "ouw25-settings-info";

  const heading = document.createElement("h4");
  heading.className = "divider";
  heading.textContent = game.i18n.localize("WORLD.FIELDS.system.label");

  const badge = document.createElement("div");
  badge.className = "ouw25-system-badge";
  const logo = document.createElement("img");
  logo.src = "systems/ouw25/styles/images/system_logo.webp";
  logo.alt = game.system.title;
  const title = document.createElement("span");
  title.className = "ouw25-system-title";
  title.textContent = game.system.title;
  badge.append(logo, title, version);

  const links = document.createElement("ul");
  links.className = "ouw25-system-links";
  for (const [label, url] of [
    ["ReleaseNotes", game.system.changelog],
    ["Issues", game.system.bugs],
    ["Wiki", game.system.flags?.ouw25?.wiki]
  ]) {
    if (!url) continue;
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = game.i18n.localize(`OUW25.SystemInfo.${label}`);
    item.append(link);
    links.append(item);
  }
  section.append(heading, badge, links);
  system.remove();
  info.after(section);
}
