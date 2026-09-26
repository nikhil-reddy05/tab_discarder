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
  assert.match(
    popupHtml,
    /<label class="theme-control" for="toggleTheme">[\s\S]*?Dark theme[\s\S]*?<input type="checkbox" id="toggleTheme"/,
  );
});

test("provides a visible focus indicator for buttons and inputs", () => {
  assert.match(
    popupCss,
    /button:focus-visible,[\s\S]*?input:focus-visible,[\s\S]*?input:focus-visible \+ \.theme-toggle\s*\{[\s\S]*?outline: 2px solid var\(--focus\);/,
  );
});
