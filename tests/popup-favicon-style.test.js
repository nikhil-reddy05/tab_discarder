const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const popupCss = fs.readFileSync(
  path.join(__dirname, "../popup/popup.css"),
  "utf8",
);
const manifest = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../manifest.json"),
  "utf8",
));

test("favicon presentation preserves the standard fallback container styling", () => {
  assert.ok(manifest.permissions.includes("favicon"));
  assert.match(
    popupCss,
    /\.tab-favicon\s*\{[\s\S]*?width:\s*16px;[\s\S]*?height:\s*16px;[\s\S]*?border-radius:\s*3px;[\s\S]*?background:\s*var\(--accent-soft\);/,
  );
  assert.match(
    popupCss,
    /\.tab-favicon-image\s*\{[\s\S]*?width:\s*16px;[\s\S]*?height:\s*16px;[\s\S]*?background:\s*var\(--card\);[\s\S]*?object-fit:\s*contain;/,
  );
  assert.doesNotMatch(popupCss, /favicon-bg|drop-shadow|filter:\s*invert\(/);
});
