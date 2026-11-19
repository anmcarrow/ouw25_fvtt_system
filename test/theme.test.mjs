import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../dist/ouw25/styles/ouw25.css", import.meta.url), "utf8");

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

test("the sheet uses light opaque text surfaces with contrasting foreground colors", () => {
  const ink = color("color-ink");
  const paper = color("color-paper");
  const surface = color("color-surface");
  const accent = color("color-accent");
  const accentSoft = color("color-accent-soft");

  assert.match(styles, /color-scheme:\s*light;/);
  assert.match(styles, /\.ouw25 \.ouw25-notes \*\s*\{\s*color:\s*inherit;/);
  assert.match(styles, /\.ouw25 \.ouw25-sheet-heading\s*\{[^}]*background-color:\s*var\(--ouw25-color-surface\)/s);
  assert.match(styles, /\.ouw25 \.ouw25-notes fieldset\s*\{[^}]*background-color:\s*var\(--ouw25-color-surface\)/s);
  assert.match(styles, /--ouw25-field-background:\s*var\(--ouw25-color-surface\);/);
  assert.match(styles, /\.ouw25 \.ouw25-notes button\s*\{[^}]*color:\s*#fff8ee;[^}]*background-color:\s*var\(--ouw25-color-accent\)/s);
  assert.match(styles, /\.ouw25 \.ouw25-notes button:disabled\s*\{[^}]*color:\s*var\(--ouw25-color-ink\);[^}]*background-color:\s*var\(--ouw25-color-paper\)/s);

  for (const background of [paper, surface]) assert.ok(contrast(ink, background) >= 4.5);
  for (const background of [accent, accentSoft]) assert.ok(contrast("#fff8ee", background) >= 4.5);
  for (const foreground of ["#b3261e", "#690098", "#133e61"]) {
    assert.ok(contrast(foreground, surface) >= 4.5, `${foreground} lacks contrast on the sheet surface`);
  }
});
