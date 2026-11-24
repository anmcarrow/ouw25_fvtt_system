import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../dist/ouw25/styles/ouw25.css", import.meta.url), "utf8");
const fontStyles = await readFile(new URL("../dist/ouw25/styles/fonts.css", import.meta.url), "utf8");
const template = await readFile(new URL("../dist/ouw25/templates/actor-notes.hbs", import.meta.url), "utf8");
const actorCreateTemplate = await readFile(new URL("../dist/ouw25/templates/actor-create.hbs", import.meta.url), "utf8");

test("bargain payment field captions are compact and bold without restyling inputs", async () => {
  const bargain = await readFile(new URL("../dist/ouw25/templates/bargain.hbs", import.meta.url), "utf8");
  for (const key of ["CreditorName", "CreditorLocation", "EnemyName", "EnemyLocation"]) {
    assert.match(bargain, new RegExp(`<label(?: [^>]*)?><span>\\{\\{localize "OUW25\\.BargainCalc\\.${key}"\\}\\}`));
  }
  assert.match(bargain, /\{\{#each paymentFields\}\}\s*<label><span>\{\{localize label\}\}<\/span> <input name="\{\{name\}\}"/);
  assert.match(bargain, /name="friend"[^>]*> <span>\{\{name\}\}<\/span>/);
  assert.match(styles, /\.ouw25-bargain-payment label > span\s*\{\s*font-size:\s*0\.8em;\s*font-weight:\s*bold;/);
  assert.match(styles, /\.ouw25-bargain-grid > label > span\s*\{\s*font-size:\s*1em;/);
  assert.match(styles, /\.ouw25-bargain-people h5\s*\{\s*font-size:\s*var\(--font-size-15, 15px\);/);
});

test("bargain summary and payment breakdown are alongside their help buttons", async () => {
  const bargain = await readFile(new URL("../dist/ouw25/templates/bargain.hbs", import.meta.url), "utf8");
  assert.match(bargain, /<\/details>\s*<p class="ouw25-bargain-total ouw25-bargain-summary" data-summary role="status"><\/p>/);
  assert.match(bargain, /<fieldset class="ouw25-bargain-payment">\s*<legend>[\s\S]*?BargainCalc\.PaymentHelp[\s\S]*?data-breakdown><\/span>\s*<\/legend>/);
  assert.match(styles, /\.ouw25-bargain-payment > legend\s*\{[^}]*width:\s*calc\(100% \+ var\(--spacer-16\) - 20px\);[^}]*padding-inline-end:\s*0;/s);
  assert.match(styles, /\.ouw25-bargain-breakdown\s*\{[^}]*flex:\s*1 1 0;/s);
  assert.match(styles, /\.ouw25-bargain-summary\s*\{[^}]*border:\s*1px solid transparent;[^}]*font-size:\s*min\(0\.8em, 0\.8rem\);/s);
  assert.match(styles, /\.ouw25-bargain-breakdown\s*\{[^}]*font-size:\s*0\.8em;/s);
  assert.match(styles, /\.ouw25-bargain-price p\s*\{[^}]*font-size:\s*min\(1em, 0\.8rem\);/s);
  assert.match(styles, /\.ouw25-bargain-price\s*\{[^}]*margin-block-start:\s*5px;/s);
  assert.match(styles, /fieldset\.ouw25-bargain-payment\s*\{[^}]*margin-block-start:\s*5px;/s);
  assert.match(styles, /\.ouw25-bargain-payment-help > summary::before,\s*\.ouw25-bargain-payment-help > summary::after\s*\{[^}]*background:\s*var\(--ouw25-border-gradient\);/s);
});

test("bargain consequences and payment controls use the requested layouts", async () => {
  const bargain = await readFile(new URL("../dist/ouw25/templates/bargain.hbs", import.meta.url), "utf8");
  assert.match(bargain, /class="ouw25-bargain-consequences">[\s\S]*?class="ouw25-bargain-debts"[\s\S]*?class="ouw25-bargain-consequences-right">[\s\S]*?class="ouw25-bargain-enemies"[\s\S]*?BargainCalc\.SacrificialFriends/);
  assert.match(bargain, /<legend><label><span>\{\{localize "OUW25\.BargainCalc\.NewEnemies"\}\}<\/span> <input name="enemies"/);
  assert.match(bargain, /<p class="ouw25-bargain-empty" data-no-enemies aria-hidden="false"><span>\{\{localize "OUW25\.BargainCalc\.NoNewEnemies"\}\}<\/span><\/p>/);
  assert.match(bargain, /<p class="ouw25-bargain-empty"><span>\{\{localize "OUW25\.BargainCalc\.NoFriends"\}\}<\/span><\/p>/);
  assert.match(styles, /\.ouw25-bargain-grid\s*\{[^}]*grid-template-columns:[^;]*- 7px[^;]*\+ 7px[^;]*;[^}]*grid-template-rows:\s*repeat\(2,/s);
  assert.match(styles, /\.ouw25-bargain-grid > label\s*\{[^}]*justify-content:\s*flex-end;/s);
  assert.match(styles, /\.ouw25-bargain-grid > label\s*\{[^}]*gap:\s*0\.28125rem;/s);
  assert.match(styles, /input:is\(\[name="cash"\], \[name="budget"\]\)\s*\{[^}]*width:\s*calc\(7ch/s);
  for (const kind of ["loan", "enemies", "friends"]) {
    assert.match(bargain, new RegExp(`<span class="ouw25-bargain-points" data-points="${kind}" role="status"></span>`));
  }
  assert.match(styles, /\.ouw25-bargain-points\s*\{[^}]*aspect-ratio:\s*1;[^}]*border-radius:\s*50%/s);
});

test("bargain outcome selector displays an unavailable placeholder without fading", async () => {
  const bargain = await readFile(new URL("../dist/ouw25/templates/bargain.hbs", import.meta.url), "utf8");
  assert.match(bargain, /<option value="" selected disabled hidden>\{\{localize "OUW25\.BargainCalc\.NotApplicable"\}\}<\/option>/);
  assert.match(bargain, /<option value="\{\{id\}\}">\+ \{\{localize label\}\}<\/option>/);
  assert.match(bargain, /<option value="custom">\+ \{\{localize "OUW25\.BargainCalc\.Custom"\}\}<\/option>/);
  assert.match(bargain, /&#x2193;<\/span><input name="complications"/);
  assert.match(bargain, /&#x2191;<\/span><input name="advantages"/);
  assert.match(styles, /\.ouw25-bargain-outcome > select:disabled\s*\{[^}]*--ouw25-bargain-ink:\s*#715d4b;[^}]*opacity:\s*1;/s);
  assert.match(styles, /\.ouw25-bargain-counter input\[type="number"\]\s*\{[^}]*width:\s*calc\(3ch \+ 1\.8rem\);[^}]*appearance:\s*auto;/s);
  assert.match(styles, /\.ouw25-bargain-counter input\[type="number"\]::-webkit-inner-spin-button,[\s\S]*?::-webkit-outer-spin-button\s*\{[^}]*-webkit-appearance:\s*auto;/s);
});

test("lost friends wrap as checkbox and name pairs", async () => {
  const bargain = await readFile(new URL("../dist/ouw25/templates/bargain.hbs", import.meta.url), "utf8");
  assert.match(bargain, /class="ouw25-bargain-friends">[\s\S]*?<label><input type="checkbox" name="friend"[^>]*> <span>\{\{name\}\}<\/span><\/label>/);
  assert.match(styles, /\.ouw25-bargain-friends\s*\{[^}]*flex-wrap:\s*wrap;[^}]*gap:\s*0\.3rem 3ch;/s);
  assert.match(styles, /\.ouw25-bargain-friends label > span\s*\{\s*font-size:\s*1\.2em;/);
});

test("bargain dialog scrolls its content while retaining its footer", () => {
  assert.match(styles, /\.application\.ouw25\.ouw25-bargain-dialog\s*\{[^}]*min-width:\s*800px;\s*max-width:\s*800px;/s);
  assert.match(styles, /\.ouw25-bargain-dialog \.dialog-form\s*\{\s*flex:\s*1 1 auto;/);
  assert.match(styles, /\.ouw25-bargain-dialog \.dialog-content\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  assert.match(styles, /\.ouw25-bargain-dialog \.dialog-content\s*\{[^}]*padding-block-start:\s*0\.75rem;/s);
  assert.match(styles, /\.ouw25-bargain-dialog \.form-footer\s*\{\s*flex:\s*0 0 auto;/);
  const contentPadding = styles.match(/\.ouw25-bargain-dialog \.dialog-content\s*\{[^}]*padding-inline:\s*([^;]+);/s)?.[1];
  const footerPadding = styles.match(/\.ouw25-bargain-dialog \.form-footer\s*\{[^}]*padding-inline:\s*([^;]+);/s)?.[1];
  assert.equal(contentPadding, "calc(0.5rem + 20px) calc(0.5rem + 12px + 20px)");
  assert.equal(footerPadding, contentPadding);
  assert.match(styles, /\.ouw25-bargain-dialog \.form-footer\s*\{[^}]*padding-block:\s*0\.4375rem 0\.0625rem;/s);
  assert.match(styles, /\.ouw25-bargain-dialog \.form-footer::before\s*\{[^}]*inset:\s*-0\.125rem -0\.5rem -0\.5rem;/s);
  assert.match(styles, /\.ouw25-bargain-dialog \.form-footer::before\s*\{[^}]*linear-gradient\(to top, rgba\(0, 0, 0, 0\.2\), transparent 40px\)[^}]*panel2\.webp[^}]*box-shadow:/s);
  assert.match(styles, /button\[data-action="ok"\]\s*\{[^}]*flex:\s*0 0 50%;/s);
  assert.match(styles, /\.ouw25-bargain-dialog:not\(\.minimizing, \.minimized, \.maximizing\)\s*\{\s*min-height:\s*min\(var\(--ouw25-bargain-min-height/);
  assert.match(styles, /\.ouw25-bargain-dialog \.window-content\s*\{[^}]*background:[^;]*panel1\.webp[^;]*100% auto no-repeat;/s);
  assert.match(styles, /\.ouw25-bargain-scrollbar-thumb\s*\{[^}]*background:/s);
});

test("bargain panels and headings use the accent gradient", async () => {
  const asset = await readFile(new URL("../dist/ouw25/styles/images/panel1.webp", import.meta.url));
  assert.equal(asset.subarray(8, 12).toString(), "WEBP");
  assert.match(styles, /\.ouw25-bargain-consequences fieldset\s*\{[^}]*border-image:\s*var\(--ouw25-border-gradient\) 1;/s);
  assert.match(styles, /\.ouw25-bargain-drop::before,\s*\.ouw25-bargain-drop::after\s*\{[^}]*mask-composite:\s*exclude;/s);
  assert.match(styles, /\.ouw25-bargain-drop::before\s*\{\s*background:\s*var\(--ouw25-border-gradient\);/);
  assert.match(styles, /\.ouw25-bargain-points\s*\{[^}]*background:[^;]*var\(--ouw25-bargain-brass\) border-box;/s);
  for (const selector of ["breakdown", "price"]) {
    assert.match(styles, new RegExp(`\\.ouw25-bargain-${selector}\\s*\\{[^}]*border-image:\\s*var\\(--ouw25-border-gradient\\) 1;`, "s"));
  }
  assert.match(styles, /label > span:not\(\[aria-hidden="true"\]\)[\s\S]*?background-image:\s*var\(--ouw25-border-gradient\);\s*background-clip:\s*text;/);
  assert.match(styles, /label > span:not\(\[aria-hidden="true"\]\)[\s\S]*?filter:\s*drop-shadow\(1px 1px 0 rgba\(0, 0, 0, 0\.2\)\);/);
  assert.match(styles, /\.dialog-content \.ouw25-bargain label > span:not\(\[aria-hidden="true"\]\)\s*\{\s*filter:\s*drop-shadow\(2px 2px 0 rgba\(0, 0, 0, 0\.2\)\);/);
  assert.match(styles, /\.ouw25-bargain-drop::after\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.2\);[^}]*transform:\s*translate\(1px, 1px\);/s);
  const bargain = await readFile(new URL("../dist/ouw25/templates/bargain.hbs", import.meta.url), "utf8");
  assert.match(bargain, /<label data-custom hidden><span>\{\{localize "OUW25\.BargainCalc\.CustomDescription"\}\}<\/span>/);
});

test("bargain mechanical controls retain distinct states and keyboard focus", async () => {
  const bargain = await readFile(new URL("../dist/ouw25/templates/bargain.hbs", import.meta.url), "utf8");
  assert.equal((bargain.match(/<summary[^>]*><span aria-hidden="true">\?<\/span><\/summary>/g) ?? []).length, 2);
  assert.match(styles, /\.ouw25-bargain-help > summary\s*\{[^}]*color:\s*#20452e;/s);
  assert.match(styles, /\.ouw25-bargain-help > summary > span\s*\{\s*font-weight:\s*700;/);
  assert.match(styles, /\.ouw25-bargain-help > summary:focus-visible\s*\{[^}]*outline:/s);
  assert.match(styles, /\.ouw25-bargain-switch input:checked\s*\{[^}]*background:\s*#80bb7b;/s);
  assert.match(styles, /\.ouw25-bargain-switch input:checked::before\s*\{[^}]*transform:/s);
  assert.match(styles, /button\[data-action="ok"\]:active\s*\{[^}]*transform:\s*translateY\(2px\)/s);
  assert.match(styles, /button\[data-action="ok"\]:focus-visible\s*\{[^}]*outline:/s);
});

test("bargain empty states slide out on paper cards and respect reduced motion", () => {
  assert.match(styles, /\.ouw25-bargain-empty > span\s*\{[^}]*smallpaper6\.webp[^}]*color:\s*var\(--ouw25-color-ink\);[^}]*transition:\s*transform 600ms ease/s);
  assert.match(styles, /\.ouw25-bargain-empty\[aria-hidden="true"\] > span\s*\{[^}]*transition:\s*transform 600ms ease, visibility 0s 600ms;/s);
  assert.match(styles, /\.ouw25-bargain-empty\[aria-hidden="true"\] > span\s*\{[^}]*transform:\s*translateX\(800px\)/s);
  assert.match(styles, /@starting-style\s*\{\s*\.ouw25-bargain-empty:not\(\[aria-hidden="true"\]\) > span\s*\{\s*transform:\s*translateX\(800px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ouw25-bargain-empty,[\s\S]*?transition:\s*none;/);
});

test("bargain warning slides behind the window edge and respects reduced motion", async () => {
  const bargain = await readFile(new URL("../dist/ouw25/templates/bargain.hbs", import.meta.url), "utf8");
  assert.match(bargain, /data-error role="alert" aria-hidden="true"/);
  assert.match(styles, /\.ouw25-bargain-error\s*\{[^}]*color:\s*#ff795c;[^}]*background:\s*linear-gradient\(#341911, #1a0b09\);[^}]*font-family:\s*"Alice", Georgia, serif;/s);
  assert.match(styles, /\.ouw25-bargain-error\s*\{[^}]*border-radius:\s*0 0 0\.5rem 0\.5rem;[^}]*transition:\s*transform 250ms ease/s);
  assert.match(styles, /\.ouw25-bargain-error\[aria-hidden="true"\]\s*\{[^}]*visibility:\s*hidden;[^}]*transform:\s*translateY\(-100%\)/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ouw25-bargain-error,\s*\.ouw25-bargain-error\[aria-hidden="true"\]\s*\{\s*transition:\s*none;/);
});

test("bargain consequences backdrop is translucent and non-interactive", () => {
  assert.match(styles, /\.ouw25-bargain-consequences-backdrop\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.2\);[^}]*filter:\s*blur\(3px\);[^}]*pointer-events:\s*none;/s);
  assert.match(styles, /\.ouw25-bargain-dialog \.window-content\s*\{[^}]*isolation:\s*isolate;[^}]*overflow:\s*hidden;/s);
});

test("bargain upper backdrop scrolls with the content", () => {
  assert.match(styles, /\.ouw25-bargain-upper-backdrop\s*\{[^}]*inset-inline:\s*-30px;\s*height:\s*97px;[^}]*background:\s*rgba\(0, 0, 0, 0\.2\);[^}]*filter:\s*blur\(3px\);[^}]*pointer-events:\s*none;/s);
});

test("bargain headings and labels use the bundled Alice font", async () => {
  assert.match(styles, /\.ouw25-bargain-dialog \.ouw25-bargain :is\(h1, h2, h3, h4, h5, h6, legend, label\)\s*\{\s*font-family:\s*"Alice", Georgia, serif;/);
  for (const subset of ["cyrillic-ext", "cyrillic", "latin-ext", "latin"]) {
    assert.ok(fontStyles.includes(`./fonts/alice-${subset}.woff2`));
    const font = await readFile(new URL(`../dist/ouw25/styles/fonts/alice-${subset}.woff2`, import.meta.url));
    assert.equal(font.subarray(0, 4).toString(), "wOF2");
  }
  assert.match(await readFile(new URL("../dist/ouw25/styles/fonts/alice-OFL.txt", import.meta.url), "utf8"), /SIL OPEN FONT LICENSE/);
});

test("bargain input fields and options use the bundled Iosevka Charon Mono font", async () => {
  assert.match(styles, /\.dialog-content \.ouw25-bargain :is\(input:not\(\[type="checkbox"\]\)[^{]+\{[^}]*font-family:\s*"Iosevka Charon Mono", monospace;/s);
  assert.match(styles, /\.dialog-content \.ouw25-bargain select option\s*\{[^}]*font-family:\s*"Iosevka Charon Mono", monospace;/s);
  for (const subset of ["cyrillic-ext", "cyrillic", "latin-ext", "latin"]) {
    assert.ok(fontStyles.includes(`./fonts/iosevka-charon-mono-${subset}.woff2`));
    const font = await readFile(new URL(`../dist/ouw25/styles/fonts/iosevka-charon-mono-${subset}.woff2`, import.meta.url));
    assert.equal(font.subarray(0, 4).toString(), "wOF2");
  }
  assert.match(await readFile(new URL("../dist/ouw25/styles/fonts/iosevka-charon-mono-OFL.txt", import.meta.url), "utf8"), /SIL OPEN FONT LICENSE/);
});

test("bargain participant cards use paper and consequence frames share their corner radius", async () => {
  const asset = await readFile(new URL("../dist/ouw25/styles/images/smallpaper6.webp", import.meta.url));
  assert.equal(asset.subarray(8, 12).toString(), "WEBP");
  assert.match(styles, /\.ouw25-bargain-entry\s*\{[^}]*border-radius:\s*0\.25rem;[^}]*background:[^;]*smallpaper6\.webp[^;]*;[^}]*color:\s*var\(--ouw25-color-ink\);/s);
  assert.match(styles, /\.ouw25-bargain-consequences fieldset\s*\{[^}]*border-radius:\s*0\.25rem;[^}]*border-image-width:\s*1px 0 0;/s);
  assert.doesNotMatch(styles, /\.ouw25-bargain-consequences fieldset::(?:before|after)/);
  assert.match(styles, /\[data-helpers\] button\.ouw25-bargain-entry\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;[^}]*line-height:\s*inherit;/s);
  assert.match(styles, /\[data-helpers\] button\.ouw25-bargain-entry:hover:not\(:disabled\)\s*\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--ouw25-color-ink\);[^}]*filter:\s*none;/s);
  assert.match(styles, /\[data-helpers\] button\.ouw25-bargain-entry:hover::before\s*\{\s*opacity:\s*0\.8;/);
});

test("the sheet minimum height does not interfere with Foundry window minimization", () => {
  assert.match(styles, /\.application\.ouw25:has\(\.ouw25-notes\):not\(\.minimizing, \.minimized, \.maximizing\)\s*\{\s*min-block-size:\s*60vh;/);
});

test("the active actor tab uses a bundled WebP background", async () => {
  const image = styles.match(/\.ouw25-sheet-tabs > button\.active:hover:not\(:disabled\)\s*\{\s*background: url\("\.\/([^"]+)"\)/)?.[1];
  assert.ok(image);
  const asset = await readFile(new URL(`../dist/ouw25/styles/${image}`, import.meta.url));
  assert.equal(asset.toString("ascii", 8, 12), "WEBP");
});

test("actor type headings use the bundled Roll20 header background", async () => {
  assert.match(template, /<header class="ouw25-sheet-heading ouw25-token-heading\{\{#if identity\}\} ouw25-merchant-heading\{\{\/if\}\}">[\s\S]*?<h2>\{\{localize actorTypeLabel\}\}<\/h2>/);
  assert.match(styles, /\.ouw25-sheet-heading::before\s*\{[^}]*inset-inline:\s*-10px -1rem;[^}]*background:\s*url\("\.\/images\/header_strip1\.webp"\) left center \/ calc\(100% \+ 1rem - 10px\) 100% no-repeat/s);
  const asset = await readFile(new URL("../dist/ouw25/styles/images/header_strip1.webp", import.meta.url));
  assert.equal(asset.subarray(8, 12).toString(), "WEBP");
});

test("actor headings use bundled tokens as accessible configuration buttons", async () => {
  assert.match(template, /\{\{#if token\.canConfigure\}\}\s*<button type="button" class="ouw25-actor-token" data-action="configureActorToken" aria-label="\{\{localize token\.label\}\}"/);
  assert.match(template, /\{\{else\}\}\s*<img class="ouw25-actor-token" src="\{\{token\.icon\}\}" alt="">/);
  assert.match(styles, /\.ouw25-token-heading \.ouw25-actor-token\s*\{[^}]*inset-block-start:\s*-16px;[^}]*inset-inline-start:\s*-16px;[^}]*inline-size:\s*100px;[^}]*block-size:\s*100px;/s);
  assert.match(styles, /\.ouw25-merchant-heading \.ouw25-actor-token\s*\{\s*inset-block-start:\s*-14px;\s*inset-inline-start:\s*-14px;/);
  assert.match(styles, /\.ouw25-token-heading \.ouw25-actor-token\s*\{[^}]*transform:\s*rotate\(-2deg\);/s);
  assert.match(styles, /\.ouw25-token-heading \.ouw25-actor-token:hover\s*\{\s*transform:\s*rotate\(0deg\) scale\(1\.035\);/);
  assert.match(styles, /\.ouw25-sheet-heading\.ouw25-token-heading h2\s*\{\s*padding-inline-start:\s*90px;/);
  for (const token of ["ship", "pc"]) {
    const asset = await readFile(new URL(`../dist/ouw25/styles/images/${token}_token.webp`, import.meta.url));
    assert.equal(asset.subarray(8, 12).toString(), "WEBP");
  }
});

test("record tables retain accessible names without visible block headings", () => {
  for (const kind of ["contacts", "contracts", "ports", "cargo", "ledger", "relationships", "possessions"]) {
    const block = template.match(new RegExp(`<fieldset class="ouw25-${kind}"([^>]*)>([\\s\\S]*?)</fieldset>`));
    assert.ok(block, `missing ${kind} block`);
    assert.match(block[1], /aria-label=/);
    assert.doesNotMatch(block[2], /<legend\b|ouw25-block-heading/);
  }
  assert.match(template, /<caption><h4>\{\{localize label\}\}<\/h4><\/caption>/);
  assert.match(template, /<p class="ouw25-ledger-totals">[\s\S]*?<\/p>\s*<fieldset class="ouw25-ledger"/);
  assert.match(template, /<p class="ouw25-contacts-total">[\s\S]*?<\/p>\s*<fieldset class="ouw25-contacts"/);
});

test("voyage status cards follow a single travel summary", () => {
  const voyage = template.match(/<fieldset class="ouw25-voyage">([\s\S]*?)<\/fieldset>/)?.[1];
  assert.ok(voyage);
  assert.match(voyage, /<p class="ouw25-voyage-summary">[\s\S]*?OUW25\.Voyage\.TravelCounters[\s\S]*?OUW25\.Voyage\.TravelRates[\s\S]*?<\/p>\s*<div class="ouw25-voyage-statuses">/);
  for (const key of ["ForcedBlocked", "FuelLow", "ProvisionsLow", "TravelInfo"]) {
    assert.match(voyage, new RegExp(`<div class="ouw25-voyage-statuses">[\\s\\S]*?OUW25\\.Voyage\\.${key}`));
  }
  assert.match(voyage, /\{\{#each ship\.voyage\.displayShortages\}\}<p role="status">/);
  assert.match(voyage, /\{\{#if ship\.hold\.overloaded\}\}<p role="status">\{\{localize "OUW25\.Ship\.Overloaded"\}\}/);
  assert.match(voyage, /\{\{#if ship\.hold\.overloaded\}\}<p role="status">[\s\S]*?\{\{\/if\}\}\s*<\/div>\s*$/);
  assert.match(voyage, /\{\{#if ship\.travelStatus\}\}<p role="status">\{\{ship\.travelStatus\}\}<\/p>/);
  assert.doesNotMatch(voyage, /OUW25\.Voyage\.ForcedOn/);
  assert.match(voyage, /\{\{#unless ship\.forcedMode\}\}<p>\{\{localize "OUW25\.Voyage\.ForcedOff"\}\}<\/p>\{\{\/unless\}\}/);
});

test("equipment effects follow the compartment list", () => {
  assert.match(template, /\{\{> ouw25-ship-list list=ship\.compartments showSpace=true\}\}\s*<section class="ouw25-ship-equipment-card">\s*<p>\{\{#each ship\.equipmentEffects\}\}/);
  assert.match(template, /<strong><span\{\{#if ship\.voyage\.forced\}\} class="ouw25-speed-forced"[^>]*>\{\{ship\.voyage\.speed\}\}<\/span><\/strong>/);
});

test("cooperative titled blocks use a translucent background without fading content", () => {
  const rule = styles.match(/\.ouw25-notes:has\(\.ouw25-cooperative-layout\) fieldset:has\(> legend\)\s*\{([^}]*)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /background-color:\s*color-mix\(in srgb, var\(--ouw25-color-surface\) 70%, transparent\)/);
  assert.doesNotMatch(rule, /\bopacity\s*:/);
});

test("cooperative attributes put founders on the left and other blocks above the journal", () => {
  const attributes = template.match(/\{\{#> ouw25-tab tab=tabs\.attributes layout="ouw25-cooperative-layout"\}\}([\s\S]*?)\{\{\/ouw25-tab\}\}/)?.[1];
  assert.ok(attributes);
  const [left, right] = attributes.split('<div class="ouw25-sheet-column ouw25-cooperative-notes">');
  assert.ok(right);
  assert.match(left, /<div class="ouw25-choice-row ouw25-identity">\s*<input type="text" name="name" aria-label="\{\{localize "OUW25\.Cooperative\.Name"\}\}" value="\{\{cooperative\.name\}\}" required \{\{#unless editable\}\}readonly\{\{\/unless\}\}>\s*<\/div>\s*<fieldset class="ouw25-founders">/);
  assert.match(left, /OUW25\.Founders\.Title/);
  assert.doesNotMatch(left, /OUW25\.Finance\.Budget|OUW25\.Cooperative\.(Reputation|Memory)\.Title|ouw25-journal/);
  assert.match(right, /OUW25\.Finance\.Budget[\s\S]*OUW25\.Cooperative\.Reputation\.Title[\s\S]*OUW25\.Cooperative\.Memory\.Title[\s\S]*\{\{> ouw25-journal\}\}/);
  assert.doesNotMatch(right, /OUW25\.Founders\.Title/);
  assert.match(styles, /\.ouw25-sheet-column\.ouw25-cooperative-notes\s*\{\s*gap:\s*20px;/);
  assert.match(styles, /\.ouw25-cooperative-notes > textarea\[name="system\.notes"\]\s*\{[^}]*flex:\s*0 0 auto;[^}]*block-size:\s*10em;/s);
});

test("founder summary keeps each localized subblock together", async () => {
  const summary = template.match(/<p class="ouw25-founder-summary">([\s\S]*?)<\/p>/)?.[1];
  assert.ok(summary);
  assert.equal((summary.match(/<span>/g) ?? []).length, 6);
  assert.doesNotMatch(summary, / – /);
  assert.match(styles, /\.ouw25-founder-summary > span\s*\{\s*white-space:\s*nowrap;/);
  for (const language of ["en", "ru"]) {
    const { OUW25: { Founders: founders } } = JSON.parse(await readFile(new URL(`../dist/ouw25/lang/${language}.json`, import.meta.url), "utf8"));
    for (const key of ["Money", "NoMoney", "NoDebt", "NoSavings", "NoFriends", "NoEnemies", "NoCreditors"]) {
      assert.match(founders[key], /\u00a0/);
      assert.doesNotMatch(founders[key], / /);
    }
  }
});

test("cooperative tab labels show discovered ports, occupied hold and marked damage", () => {
  const nav = template.match(/<nav class="tabs ouw25-sheet-tabs"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav);
  assert.match(nav, /\{\{#if \(eq id "ports"\)\}\} \(\{\{@root\.ports\.discovered\}\}\/\{\{@root\.ports\.total\}\}\)/);
  assert.match(nav, /\{\{#if \(eq id "cargo"\)\}\} \(\{\{@root\.ship\.hold\.occupied\}\}\)/);
  assert.match(nav, /\{\{#if @root\.ship\.condition\.tabDestroyed\}\} class="ouw25-tab-ship-destroyed"/);
  assert.match(nav, /<\/span>\{\{#if \(eq id "ship"\)\}\}[\s\S]*?<span class="ouw25-tab-damage"/);
  assert.match(nav, /class="ouw25-tab-damage" style="font-size: \{\{@root\.ship\.condition\.tabIconPercent\}\}%"[\s\S]*?\{\{#each @root\.ship\.condition\.tabDamage\}\}[\s\S]*?\{\{#if @root\.ship\.condition\.tabDestroyed\}\}&#x1F480;\{\{else\}\}&#x1F4A5;/);
  assert.match(styles, /button\[data-tab="ship"\]:has\(> \.ouw25-tab-damage\)\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:/s);
  assert.match(styles, /\.ouw25-tab-ship-destroyed\s*\{\s*text-decoration:\s*line-through double;/);
  assert.match(styles, /\.ouw25-tab-damage\s*\{[^}]*gap:\s*0\.25em;[^}]*line-height:\s*1\.2;/s);
  assert.match(styles, /\.ouw25-tab\[data-tab="ship"\]\s*\{[^}]*margin-block-start:\s*-0\.75rem;[^}]*padding-block-start:\s*0\.75rem;[^}]*overflow-y:\s*clip;/s);
});

test("ship resource capacities accompany their inputs while retaining calculated summaries", () => {
  const basics = template.match(/\{\{#\*inline "ouw25-ship-basics"\}\}([\s\S]*?)\{\{\/inline\}\}/)?.[1];
  assert.ok(basics);
  assert.match(basics, /name="system\.crewCount"[\s\S]*?OUW25\.Voyage\.CrewSummary[\s\S]*?OUW25\.Voyage\.Capacity" capacity=ship\.voyage\.crewCapacity/);
  assert.match(basics, /name="system\.unrest"[\s\S]*?OUW25\.Voyage\.UnrestCurrent" unrest=ship\.voyage\.unrest[\s\S]*?OUW25\.Voyage\.Capacity" capacity=25/);
  assert.doesNotMatch(basics, /<p>\{\{localize "OUW25\.Voyage\.(CrewSummary|UnrestCurrent)"/);
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
  assert.match(template, /data-action="tab"[^>]*><span[\s\S]*?>\{\{localize label\}\}/);
  assert.match(styles, /\.ouw25-sheet-tabs > button:not\(\.active\):hover > span\s*\{\s*color:\s*color-mix\(/);
  assert.match(styles, /background:\s*radial-gradient\(ellipse at center, var\(--ouw25-button-color/);
  assert.match(styles, /background:\s*radial-gradient\(ellipse at center, #32445e, #485d78\)/);
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
