import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../dist/ouw25/styles/ouw25.css", import.meta.url), "utf8");
const fontStyles = await readFile(new URL("../dist/ouw25/styles/fonts.css", import.meta.url), "utf8");

test("the active actor tab uses a bundled WebP background", async () => {
  const image = styles.match(/\.ouw25-sheet-tabs > button\.active:hover:not\(:disabled\)\s*\{\s*background: url\("\.\/([^"]+)"\)/)?.[1];
  assert.ok(image);
  const asset = await readFile(new URL(`../dist/ouw25/styles/${image}`, import.meta.url));
  assert.equal(asset.toString("ascii", 8, 12), "WEBP");
});
const module = await readFile(new URL("../dist/ouw25/module/ouw25.mjs", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../dist/ouw25/system.json", import.meta.url), "utf8"));

function color(name) {
  const match = styles.match(new RegExp(`--ouw25-${name}:\\s*(#[0-9a-f]{6});`, "i"));
  assert.ok(match, `missing solid color token --ouw25-${name}`);
  return match[1];
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function composite(background, foreground, alpha) {
  const backgroundChannels = background.slice(1).match(/../g).map(value => parseInt(value, 16));
  const channels = foreground.map((value, index) => Math.round(value * alpha + backgroundChannels[index] * (1 - alpha)));
  return `#${channels.map(value => value.toString(16).padStart(2, "0")).join("")}`;
}

test("the sheet uses light text surfaces with contrasting foreground colors", () => {
  const ink = color("color-ink");
  const paper = color("color-paper");
  const surface = color("color-surface");
  const accent = color("color-accent");
  const accentSoft = styles.match(/--ouw25-color-accent-soft:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\);/i);
  assert.ok(accentSoft, "button color must match the Roll20 translucent brown");
  const buttonSurface = composite(surface, accentSoft.slice(1, 4).map(Number), Number(accentSoft[4]));

  assert.match(styles, /color-scheme:\s*light;/);
  assert.match(styles, /\.ouw25 \.ouw25-notes \*\s*\{\s*color:\s*inherit;/);
  assert.match(styles, /body\.game \.application\.ouw25 \.ouw25-notes input\[type="checkbox"\]\s*\{(?=[^}]*--checkbox-background-color:\s*var\(--ouw25-color-accent\);)(?=[^}]*--checkbox-checked-color:\s*var\(--ouw25-color-accent-soft\);)(?=[^}]*--checkbox-checkmark-color:\s*var\(--ouw25-color-surface\);)(?=[^}]*--checkbox-font-weight:\s*unset;)(?=[^}]*accent-color:\s*var\(--ouw25-color-accent-soft\);)(?=[^}]*color-scheme:\s*light;)[^}]*\}/s);
  assert.match(styles, /body\.game \.application\.ouw25 \.ouw25-notes input\[type="checkbox"\]:disabled,\s*body\.game \.application\.ouw25 \.ouw25-notes input\[type="checkbox"\]\[readonly\]\s*\{[^}]*--checkbox-background-color:\s*var\(--ouw25-color-paper\);/s);
  assert.match(styles, /\.ouw25 \.ouw25-notes fieldset\s*\{[^}]*background-color:\s*var\(--ouw25-color-surface\);/s);
  assert.match(styles, /--ouw25-field-background:\s*var\(--ouw25-surface-translucent\);/);
  assert.match(styles, /--ouw25-surface-translucent:\s*color-mix\(in srgb, var\(--ouw25-color-surface\) 80%, transparent\);/);
  assert.match(styles, /--color-select-option-bg:\s*var\(--ouw25-color-surface\);/);
  assert.match(styles, /body\.game \.application\.ouw25 \.ouw25-notes option\s*\{[^}]*color:\s*var\(--ouw25-color-ink\);[^}]*background-color:\s*var\(--ouw25-color-surface\);/s);
  assert.match(styles, /\.ouw25 \.ouw25-notes :is\(input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="hidden"\]\), select, textarea\)\s*\{[^}]*color:\s*var\(--ouw25-color-ink\);[^}]*background-color:\s*var\(--ouw25-field-background\);/s);
  assert.match(styles, /\.ouw25 \.ouw25-notes \.ouw25-debt-table thead,\s*\.ouw25 \.ouw25-notes \.ouw25-debt-table tfoot\s*\{[^}]*color:\s*var\(--ouw25-color-ink\);[^}]*background:\s*var\(--ouw25-color-surface\);[^}]*text-shadow:\s*none;/s);
  assert.match(styles, /\.ouw25 \.ouw25-notes \.ouw25-debt-table tbody tr:nth-child\(even\)\s*\{\s*background-color:\s*var\(--ouw25-color-paper\);/);
  assert.match(styles, /\.ouw25 \.ouw25-notes \.ouw25-debt-table tbody tr:nth-child\(odd\)\s*\{\s*background-color:\s*var\(--ouw25-color-surface\);/);
  assert.match(styles, /body\.game \.application\.ouw25 \.ouw25-notes button,\s*body\.game \.application\.ouw25 \.dialog-content button,\s*body\.game \.application\.ouw25 \.form-footer button\s*\{(?=[^}]*margin-block:\s*0\.25rem;)(?=[^}]*padding:\s*0\.45rem 0\.7rem;)(?=[^}]*background:\s*var\(--ouw25-color-accent-soft\);)(?=[^}]*color:\s*#fff8ee;)[^}]*\}/s);
  assert.match(styles, /body\.game \.application\.ouw25 \.ouw25-notes button:disabled,\s*body\.game \.application\.ouw25 \.dialog-content button:disabled,\s*body\.game \.application\.ouw25 \.form-footer button:disabled\s*\{[^}]*background:\s*var\(--ouw25-color-paper\);[^}]*color:\s*var\(--ouw25-color-ink\);/s);
  assert.match(styles, /body\.game \.application\.ouw25 \.dialog-content \.form-group\s*\{[^}]*margin-block:\s*0\.5rem;/s);
  assert.match(styles, /\.ouw25 \.dialog-content\s*\{[^}]*background:\s*var\(--ouw25-color-paper\);/s);
  assert.match(module, /static DEFAULT_OPTIONS = \{\s*classes:\s*\["ouw25"\]/s);
  assert.doesNotMatch(module, /DialogV2\.(?:input|confirm)\(\{\s*(?!\s|classes:)/);
  assert.match(styles, /body\.game \.application\.ouw25 \.dialog-content :is\([^}]*border: 1px solid var\(--ouw25-color-accent\);/s);

  for (const background of [paper, surface]) assert.ok(contrast(ink, background) >= 4.5);
  assert.ok(contrast("#fff8ee", accent) >= 4.5);
  assert.ok(contrast("#fff8ee", buttonSurface) >= 4.5);
  for (const foreground of ["#b3261e", "#690098", "#133e61"]) {
    assert.ok(contrast(foreground, surface) >= 4.5, `${foreground} lacks contrast on the sheet surface`);
  }
});

test("the Merchant sidebar uses bundled Roll20 textures", async () => {
  for (const [pattern, image] of [
    [/\.ouw25-pension\s*\{[^}]*--ouw25-card-paper:/, "smallpaper3"],
    [/\.ouw25-money-card\s*\{[^}]*--ouw25-card-paper:/, "smallpaper4"],
    [/details\.ouw25-sidebar-card\s*\{[^}]*--ouw25-card-paper:/, "smallpaper5"],
    [/\.ouw25-luck\s*\{[^}]*background:/, "lucky_point"],
    [/\.ouw25-merchant-wounds\s*\{[^}]*background:/, "blood"]
  ]) {
    const ref = `./images/${image}.webp`;
    const match = styles.match(pattern);
    assert.ok(match, `missing sidebar style for ${image}`);
    assert.ok(styles.slice(match.index + match[0].length).trimStart().startsWith(`url("${ref}")`));
    const asset = await readFile(new URL(`../dist/ouw25/styles/${ref}`, import.meta.url));
    assert.equal(asset.subarray(8, 12).toString(), "WEBP");
  }
});

test("Roll20 body, display, field, and accent fonts are bundled and applied within the AppV2 root", async () => {
  assert.deepEqual(manifest.styles, ["styles/fonts.css", "styles/ouw25.css"]);
  for (const family of ["PT Sans", "Viaoda Libre", "LXGW WenKai Mono TC", "Caveat", "Limelight"]) {
    assert.ok(fontStyles.includes(`font-family: '${family}'`), `missing ${family} font-face`);
  }
  assert.match(fontStyles, /U\+0400-045F/);
  assert.doesNotMatch(fontStyles, /fonts\.googleapis\.com|fonts\.gstatic\.com/);

  const fontAssets = [...fontStyles.matchAll(/src:\s*url\("([^"]+)"\)/g)].map(([, url]) => url);
  assert.ok(fontAssets.length > 0);
  for (const asset of fontAssets) {
    assert.ok(asset.startsWith("./fonts/"), `font URL must be local: ${asset}`);
    await readFile(new URL(`../dist/ouw25/styles/${asset.slice(2)}`, import.meta.url));
  }

  assert.match(styles, /--ouw25-font-heading:\s*"Viaoda Libre"/);
  assert.match(styles, /--ouw25-font-body:\s*"PT Sans"/);
  assert.match(styles, /--ouw25-font-input:\s*"LXGW WenKai Mono TC"/);
  assert.match(styles, /--ouw25-font-accent:\s*"Caveat"/);
  assert.match(styles, /body\.game \.application\.ouw25 \.ouw25-notes :is\(h1, h2, h3, h4, h5, h6, summary\)[\s\S]*?font-family:\s*var\(--ouw25-font-heading\);/);
  assert.match(styles, /body\.game \.application\.ouw25 \.ouw25-notes :is\(input:not\(\[type="checkbox"\]\)[\s\S]*?font-family:\s*var\(--ouw25-font-input\);/);
  assert.match(styles, /body\.game \.application\.ouw25 \.ouw25-notes option,\s*body\.game \.application\.ouw25 \.dialog-content option\s*\{\s*font-family:\s*var\(--ouw25-font-input\);/);
  assert.match(styles, /body\.game \.application\.ouw25 \.ouw25-sheet-heading h2\s*\{(?=[^}]*color:\s*var\(--ouw25-color-accent\);)(?=[^}]*font-size:\s*1\.7rem;)(?=[^}]*margin:\s*0;)[^}]*\}/s);
  assert.match(styles, /body\.game \.application\.ouw25 \.ouw25-notes :is\(h2, h3\),\s*body\.game \.application\.ouw25 \.dialog-content :is\(h2, h3\)\s*\{(?=[^}]*color:\s*var\(--ouw25-color-accent\);)(?=[^}]*margin-block:\s*0\.8rem;)[^}]*\}/s);
  assert.match(styles, /body\.game \.application\.ouw25 \.ouw25-notes \.ouw25-debt-table tbody td\.ouw25-debt-amount\s*\{[^}]*font-family:\s*var\(--ouw25-font-accent\);/s);
});
