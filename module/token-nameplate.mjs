export function configureTokenNameplates() {
  if (!globalThis.document?.fonts) return;
  let loaded = false;
  const font = document.fonts.load('24px "Alice"', "Aa Аа Ёё").then(faces => {
    if (!faces.length) throw new Error("Alice font is not available");
    loaded = true;
  }).catch(error => {
    console.error("OUW25 | Could not load Alice for token nameplates", error);
  });

  function apply(token) {
    const nameplate = token.nameplate;
    if (!nameplate?.style || token.destroyed) return;
    if (loaded) nameplate.style.fontFamily = "Alice";
    else font.then(() => {
      if (loaded && !token.destroyed && token.nameplate === nameplate) nameplate.style.fontFamily = "Alice";
    });
  }

  Hooks.on("drawToken", apply);
  Hooks.on("refreshToken", (token, flags) => {
    if (flags.refreshNameplate) apply(token);
  });
}
