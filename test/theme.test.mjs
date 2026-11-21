import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../dist/ouw25/styles/ouw25.css", import.meta.url), "utf8");
const fontStyles = await readFile(new URL("../dist/ouw25/styles/fonts.css", import.meta.url), "utf8");
const template = await readFile(new URL("../dist/ouw25/templates/actor-notes.hbs", import.meta.url), "utf8");
const actorCreateTemplate = await readFile(new URL("../dist/ouw25/templates/actor-create.hbs", import.meta.url), "utf8");

test("the active actor tab uses a bundled WebP background", async () => {
  const image = styles.match(/\.ouw25-sheet-tabs > button\.active:hover:not\(:disabled\)\s*\{\s*background: url\("\.\/([^"]+)"\)/)?.[1];
  assert.ok(image);
  const asset = await readFile(new URL(`../dist/ouw25/styles/${image}`, import.meta.url));
  assert.equal(asset.toString("ascii", 8, 12), "WEBP");
});

test("record tables retain accessible names without visible block headings", () => {
  for (const kind of ["contacts", "contracts", "ledger", "relationships", "possessions"]) {
    const block = template.match(new RegExp(`<fieldset class="ouw25-${kind}"([^>]*)>([\\s\\S]*?)</fieldset>`));
    assert.ok(block, `missing ${kind} block`);
    assert.match(block[1], /aria-label=/);
    assert.doesNotMatch(block[2], /<legend\b|ouw25-block-heading/);
  }
  assert.match(template, /<caption><h4>\{\{localize label\}\}<\/h4><\/caption>/);
  assert.match(template, /<fieldset class="ouw25-cargo">\s*<legend>/);
});

test("the portrait uses a framed image and keeps utility buttons free of hover motion", async () => {
  assert.match(template, /<div class="ouw25-portrait-frame">\s*<div class="ouw25-portrait-view">\s*\{\{#if editable\}\}\s*<button[^>]*class="ouw25-portrait"/);
  assert.match(styles, /\.ouw25-portrait-frame\s*\{[^}]*inline-size:\s*200px;[^}]*block-size:\s*200px;[^}]*background:\s*url\("\.\/images\/smallphoto_frame\.webp"\)/s);
  assert.match(template, /\{\{#if identity\.hasPortrait\}\}\s*<img src="\{\{identity\.img\}\}"/);
  assert.match(actorCreateTemplate, /<input type="radio" name="type" value="\{\{type\}\}"/);
  assert.match(actorCreateTemplate, /<img src="\{\{icon\}\}" alt="" aria-hidden="true">/);
  assert.match(module, /static async createDialog\(data = \{\}, createOptions = \{\}, dialogOptions = \{\}\)/);
  assert.match(module, /DEFAULT_ACTOR_IMAGE = "icons\/svg\/mystery-man\.svg"/);
  assert.match(module, /hasPortrait:\s*Boolean\(this\.actor\.img && this\.actor\.img !== DEFAULT_ACTOR_IMAGE\)/);
  assert.match(styles, /\.ouw25-portrait-view\s*\{[^}]*inline-size:\s*180px;[^}]*block-size:\s*170px;[^}]*translate:\s*0 -5px;/s);
  assert.match(styles, /\.ouw25-portrait-view::before\s*\{[^}]*background:\s*url\("\.\/images\/bugger\.webp"\)/s);
  assert.match(styles, /\.ouw25-portrait-frame\s*\{[^}]*translate:\s*3px 0;[^}]*transform:\s*rotate\(-2deg\);/s);
  assert.match(styles, /\.ouw25-portrait-frame:hover\s*\{\s*transform:\s*rotate\(0deg\) scale\(1\.035\);/);
  assert.match(styles, /\.ouw25-identity:has\(> \.ouw25-roll-icon\) > input\s*\{\s*padding-inline-end:\s*39px;/);
  assert.match(styles, /\.ouw25-identity > \.ouw25-roll-icon\s*\{\s*inset-inline-end:\s*4px;/);
  assert.match(styles, /\.ouw25-choice-row:has\(> \.ouw25-roll-icon\[data-creation="specialty"\]\)\s*\{[^}]*padding-inline-end:\s*4px;/s);
  assert.match(styles, /button:not\(:disabled\):not\(:where\(\.ouw25-roll-icon, \.ouw25-trait-icon, \.ouw25-portrait, \[data-action="tab"\]\)\)\s*\{\s*transition:\s*translate 150ms ease, scale 150ms ease, filter 150ms ease;/);
  const utilityIconRule = styles.match(/\.ouw25-notes button:is\(\.ouw25-roll-icon, \.ouw25-trait-icon\)\s*\{[^}]*\}/s)?.[0];
  assert.ok(utilityIconRule);
  assert.match(utilityIconRule, /transition:\s*none;/);
  assert.match(utilityIconRule, /scale:\s*1;/);
  assert.doesNotMatch(utilityIconRule, /transform:\s*none;/);
  assert.match(styles, /\.ouw25-notes \.ouw25-portrait\s*\{[^}]*transition:\s*none;[^}]*scale:\s*1;/s);
  for (const image of ["bugger.webp", "smallphoto_frame.webp", "bugger_transp.webp", "ship_logo.webp"]) {
    const asset = await readFile(new URL(`../dist/ouw25/styles/images/${image}`, import.meta.url));
    assert.equal(asset.subarray(8, 12).toString(), "WEBP");
  }
});

test("actor sheet hover and panel styles retain their distinct visual roles", () => {
  assert.match(styles, /\.ouw25-portrait-view::after\s*\{[^}]*box-shadow:\s*inset /s);
  assert.match(styles, /\.ouw25-create-actor-types img\s*\{[^}]*filter:\s*invert\(1\)/s);
  assert.match(template, /data-action="tab"[^>]*><span>\{\{localize label\}\}<\/span><\/button>/);
  assert.match(styles, /\.ouw25-sheet-tabs > button:not\(\.active\):hover > span\s*\{\s*color:\s*color-mix\(/);
  assert.match(styles, /background:\s*linear-gradient\(90deg, color-mix\(in srgb, var\(--ouw25-button-color/);
});

test("light interface inverts only default actor artwork in the actor directories", () => {
  assert.match(styles, /:is\(#interface\.theme-light \.actors-sidebar, #actors-popout\.theme-light\) \.directory-item img:is\([\s\S]*?\[src="systems\/ouw25\/styles\/images\/bugger_transp\.webp"\],[\s\S]*?\[src="systems\/ouw25\/styles\/images\/ship_logo\.webp"\][\s\S]*?filter:\s*invert\(1\)/);
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
  assert.match(styles, /body\.game \.application\.ouw25 \.ouw25-notes input\[type="checkbox"\]\s*\{(?=[^}]*--checkbox-background-color:\s*var\(--ouw25-checkbox-background\);)(?=[^}]*--checkbox-checked-color:\s*var\(--ouw25-checkbox-background\);)(?=[^}]*--checkbox-checkmark-color:\s*var\(--ouw25-color-surface\);)(?=[^}]*--checkbox-font-weight:\s*unset;)(?=[^}]*accent-color:\s*var\(--ouw25-checkbox-background\);)(?=[^}]*color-scheme:\s*light;)[^}]*\}/s);
  assert.match(styles, /body\.game \.application\.ouw25 \.ouw25-notes input\[type="checkbox"\]:disabled,\s*body\.game \.application\.ouw25 \.ouw25-notes input\[type="checkbox"\]\[readonly\]\s*\{[^}]*--checkbox-background-color:\s*var\(--ouw25-checkbox-disabled-background\);/s);
  assert.match(styles, /\.ouw25 \.ouw25-notes fieldset\s*\{[^}]*background-color:\s*var\(--ouw25-color-surface\);/s);
  assert.match(styles, /--ouw25-field-background:\s*color-mix\(in srgb, var\(--ouw25-color-surface\) 70%, transparent\);/);
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
    [/--ouw25-reference-paper:/, "smallpaper5"],
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
