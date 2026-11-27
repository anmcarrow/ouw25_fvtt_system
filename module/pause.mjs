export function renderBrandedPause(html) {
  if (Hooks.events?.renderGamePause?.length > 1) {
    html.classList.remove("ouw25-pause");
    return;
  }
  const image = html.querySelector("img");
  if (!image) return;
  html.classList.add("ouw25-pause");
  image.src = "systems/ouw25/styles/images/system_logo.webp";
  image.classList.remove("fa-spin");
}
