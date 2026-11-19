import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../dist/ouw25/styles/ouw25.css", import.meta.url), "utf8");
const module = await readFile(new URL("../dist/ouw25/module/ouw25.mjs", import.meta.url), "utf8");

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

test("the sheet uses light opaque text surfaces with contrasting foreground colors", () => {
  const ink = color("color-ink");
  const paper = color("color-paper");
  const surface = color("color-surface");
  const accent = color("color-accent");
  const accentSoft = styles.match(/--ouw25-color-accent-soft:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\);/i);
  assert.ok(accentSoft, "button color must match the Roll20 translucent brown");
  const buttonSurface = composite(surface, accentSoft.slice(1, 4).map(Number), Number(accentSoft[4]));

  assert.match(styles, /color-scheme:\s*light;/);
  assert.match(styles, /--color-checkbox-checked:\s*var\(--ouw25-color-accent-soft\);/);
  assert.match(styles, /\.ouw25 \.ouw25-notes \*\s*\{\s*color:\s*inherit;/);
  assert.match(styles, /\.ouw25 \.ouw25-notes input\[type="checkbox"\]\s*\{\s*accent-color:\s*var\(--ouw25-color-accent-soft\);/);
  assert.match(styles, /\.ouw25 \.ouw25-sheet-heading\s*\{[^}]*background-color:\s*var\(--ouw25-color-surface\)/s);
  assert.match(styles, /\.ouw25 \.ouw25-notes fieldset\s*\{[^}]*background-color:\s*var\(--ouw25-color-surface\);[^}]*margin-block:\s*0\.25rem;[^}]*padding:\s*0\.5rem;/s);
  assert.match(styles, /--ouw25-field-background:\s*var\(--ouw25-color-surface\);/);
  assert.match(styles, /\.ouw25 \.ouw25-notes \.ouw25-debt-table thead,\s*\.ouw25 \.ouw25-notes \.ouw25-debt-table tfoot\s*\{[^}]*color:\s*var\(--ouw25-color-ink\);[^}]*background:\s*var\(--ouw25-color-surface\);[^}]*text-shadow:\s*none;/s);
  assert.match(styles, /\.ouw25 \.ouw25-notes \.ouw25-debt-table tbody tr:nth-child\(even\)\s*\{\s*background-color:\s*var\(--ouw25-color-paper\);/);
  assert.match(styles, /\.ouw25 \.ouw25-notes \.ouw25-debt-table tbody tr:nth-child\(odd\)\s*\{\s*background-color:\s*var\(--ouw25-color-surface\);/);
  assert.match(styles, /\.ouw25 \.ouw25-notes button,\s*\.ouw25 \.dialog-content button\s*\{(?=[^}]*margin-block:\s*0\.25rem;)(?=[^}]*padding:\s*0\.45rem 0\.7rem;)(?=[^}]*background:\s*var\(--ouw25-color-accent-soft\);)(?=[^}]*color:\s*#fff8ee;)[^}]*\}/s);
  assert.match(styles, /\.ouw25 \.ouw25-notes button:disabled,\s*\.ouw25 \.dialog-content button:disabled\s*\{[^}]*background:\s*var\(--ouw25-color-paper\);[^}]*color:\s*var\(--ouw25-color-ink\);/s);
  assert.match(styles, /\.ouw25 \.dialog-content \.form-group\s*\{[^}]*margin-block:\s*0\.5rem;/s);
  assert.match(styles, /\.ouw25 \.dialog-content\s*\{[^}]*background:\s*var\(--ouw25-color-paper\);/s);
  assert.equal((module.match(/DialogV2\.input\(\{\s*classes:\s*\["ouw25"\]/g) ?? []).length, 2);

  for (const background of [paper, surface]) assert.ok(contrast(ink, background) >= 4.5);
  assert.ok(contrast("#fff8ee", accent) >= 4.5);
  assert.ok(contrast("#fff8ee", buttonSurface) >= 4.5);
  for (const foreground of ["#b3261e", "#690098", "#133e61"]) {
    assert.ok(contrast(foreground, surface) >= 4.5, `${foreground} lacks contrast on the sheet surface`);
  }
});
