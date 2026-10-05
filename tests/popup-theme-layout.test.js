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

test("popup shell uses a subtle theme-aware scrollbar without changing its scroll behavior", () => {
  assert.match(popupCss, /:root\s*\{[\s\S]*?--scrollbar-thumb:\s*rgba\(90, 100, 125, 0\.28\);/);
  assert.match(
    popupCss,
    /\[data-theme="dark"\]\s*\{[\s\S]*?--scrollbar-thumb:\s*rgba\(190, 200, 225, 0\.26\);/,
  );
  assert.match(
    popupCss,
    /\.popup-shell\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?scrollbar-gutter:\s*stable;[\s\S]*?scrollbar-width:\s*thin;[\s\S]*?scrollbar-color:\s*var\(--scrollbar-thumb\) transparent;/,
  );
  assert.match(popupCss, /\.popup-shell:hover\s*\{[\s\S]*?scrollbar-color:\s*var\(--scrollbar-thumb-hover\) transparent;/);
  assert.match(popupCss, /\.popup-shell::\-webkit-scrollbar\s*\{[\s\S]*?width:\s*5px;/);
  assert.match(popupCss, /\.popup-shell::\-webkit-scrollbar-track\s*\{[\s\S]*?background:\s*transparent;/);
  assert.match(popupCss, /\.popup-shell::\-webkit-scrollbar-thumb\s*\{[\s\S]*?border-radius:\s*999px;[\s\S]*?background:\s*var\(--scrollbar-thumb\);/);
});

test("light theme uses the minimal muted palette while dark theme retains its existing palette", () => {
  assert.match(
    popupCss,
    /:root\s*\{[\s\S]*?--page-bg:\s*#f8fafc;[\s\S]*?--surface:\s*#ffffff;[\s\S]*?--text-primary:\s*#1f2937;[\s\S]*?--text-secondary:\s*#667085;[\s\S]*?--border:\s*#e5e7eb;[\s\S]*?--action-primary:\s*#dc2626;[\s\S]*?--action-primary-hover:\s*#b91c1c;[\s\S]*?--action-soft:\s*#fee2e2;[\s\S]*?--focus:\s*#b91c1c;/,
  );
  assert.match(
    popupCss,
    /\[data-theme="dark"\]\s*\{[\s\S]*?--accent:\s*#9aa5ff;[\s\S]*?--accent-soft:\s*#30385a;[\s\S]*?--focus:\s*#b2bbff;/,
  );
});

test("light theme keeps actions, protected statuses, and discarded statuses visually distinct", () => {
  assert.match(
    popupCss,
    /:root\s*\{[\s\S]*?--protected-bg:\s*#e5e7eb;[\s\S]*?--protected-text:\s*#475569;[\s\S]*?--discarded-bg:\s*#e7e7e7;[\s\S]*?--discarded-text:\s*#5f6673;/,
  );
  assert.match(
    popupCss,
    /\.tab-title\s*\{[\s\S]*?color:\s*var\(--text\);/,
  );
  assert.match(
    popupCss,
    /\.tab-state-badge--protected\s*\{[\s\S]*?background:\s*var\(--protected-bg\);[\s\S]*?color:\s*var\(--protected-text\);/,
  );
  assert.match(
    popupCss,
    /\.tab-state-badge--discarded\s*\{[\s\S]*?background:\s*var\(--discarded-bg\);[\s\S]*?color:\s*var\(--discarded-text\);/,
  );
  assert.match(
    popupCss,
    /\.quick-action-list button:not\(:disabled\)\s*\{[\s\S]*?background:\s*var\(--action-primary\);[\s\S]*?color:\s*var\(--action-text\);/,
  );
  assert.match(
    popupCss,
    /\.tab-discard-action,[\s\S]*?background:\s*var\(--action-primary\);[\s\S]*?color:\s*var\(--action-text\);/,
  );
  assert.match(
    popupCss,
    /\.quick-action-list button:not\(:disabled\):hover\s*\{[\s\S]*?background:\s*var\(--action-primary-hover\);/,
  );
});

test("popup no longer includes a focused binary theme toggle", () => {
  assert.doesNotMatch(popupHtml, /toggleTheme|theme-control|theme-toggle/);
  assert.doesNotMatch(popupCss, /theme-control|theme-toggle/);
});
