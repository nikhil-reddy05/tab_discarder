const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const popupHtml = fs.readFileSync(
  path.join(__dirname, "../popup/popup.html"),
  "utf8",
);
const popupCss = fs.readFileSync(
  path.join(__dirname, "../popup/popup.css"),
  "utf8",
);
const optionsHtml = fs.readFileSync(
  path.join(__dirname, "../options/options.html"),
  "utf8",
);

test("uses native, named controls for popup keyboard navigation", () => {
  assert.match(popupHtml, /<html lang="en">/);
  assert.match(
    popupHtml,
    /<button\s+id="openOptions"[\s\S]*?type="button"[\s\S]*?aria-label="Open settings"/,
  );
  assert.match(
    popupHtml,
    /<label class="visually-hidden" for="tabSearch">Search tabs<\/label>/,
  );
  assert.match(
    popupHtml,
    /<input\s+id="tabSearch"[\s\S]*?type="search"[\s\S]*?aria-describedby="searchHint"/,
  );
  assert.doesNotMatch(popupHtml, /toggleTheme|theme-control/);
  assert.match(
    optionsHtml,
    /<select id="themePreference" class="theme-select">[\s\S]*?<option value="system">System<\/option>[\s\S]*?<option value="light">Light<\/option>[\s\S]*?<option value="dark">Dark<\/option>/,
  );
});

test("provides a visible focus indicator for buttons and inputs", () => {
  assert.match(
    popupCss,
    /button:focus-visible,[\s\S]*?input:focus-visible,[\s\S]*?select:focus-visible\s*\{[\s\S]*?outline: 2px solid var\(--focus\);/,
  );
});
