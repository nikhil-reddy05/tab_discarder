const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const popupCss = fs.readFileSync(
  path.join(__dirname, "../popup/popup.css"),
  "utf8",
);
const popupScript = fs.readFileSync(
  path.join(__dirname, "../popup/popup.js"),
  "utf8",
);
const popupHtml = fs.readFileSync(
  path.join(__dirname, "../popup/popup.html"),
  "utf8",
);

test("theme changes preserve authored popup and search-control geometry", () => {
  assert.doesNotMatch(popupCss, /color-scheme\s*:/);
  assert.match(
    popupCss,
    /\.popup-shell\s*\{[\s\S]*?max-height:\s*600px;[\s\S]*?overflow-y:\s*auto;[\s\S]*?scrollbar-gutter:\s*stable;/,
  );
  assert.match(
    popupCss,
    /#tabSearch\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*36px;[\s\S]*?margin:\s*0;[\s\S]*?border:\s*1px solid var\(--border\);[\s\S]*?padding:\s*0 11px;[\s\S]*?box-sizing:\s*border-box;[\s\S]*?appearance:\s*none;[\s\S]*?-webkit-appearance:\s*none;[\s\S]*?font-family:\s*inherit;[\s\S]*?font-size:\s*13px;[\s\S]*?font-weight:\s*400;[\s\S]*?line-height:\s*1\.2;/,
  );

  assert.match(popupScript, /themeManager\.initializeTheme\(/);
  assert.doesNotMatch(popupScript, /toggleTheme|localStorage|matchMedia/);
});

test("popup no longer includes a focused binary theme toggle", () => {
  assert.doesNotMatch(popupHtml, /toggleTheme|theme-control|theme-toggle/);
  assert.doesNotMatch(popupCss, /theme-control|theme-toggle/);
});
