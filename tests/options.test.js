const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const optionsCss = fs.readFileSync(
  path.join(__dirname, "../options/options.css"),
  "utf8",
);

function createElement() {
  const listeners = new Map();

  return {
    attributes: new Map(),
    children: [],
    checked: false,
    disabled: false,
    textContent: "",
    type: "",
    value: "",
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    append(...children) {
      this.children.push(...children);
    },
    getListener(type) {
      return listeners.get(type);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
  };
}

function loadOptions({ settings, saveResult = true } = {}) {
  const elements = new Map(
    [
      "protectPinned",
      "protectAudible",
      "themePreference",
      "protectedDomainForm",
      "protectedDomainInput",
      "protectedDomainsList",
      "settingsStatus",
    ].map((id) => [
      id,
      createElement(),
    ]),
  );
  const savedSettings = [];
  const context = {
    document: {
      createElement() {
        return createElement();
      },
      getElementById(id) {
        return elements.get(id);
      },
    },
    tabDiscarderTabState: {
      normalizeProtectedDomain(value) {
        const domain = String(value || "").trim().toLowerCase().replace(/\.+$/, "");
        return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/.test(
          domain,
        )
          ? domain
          : null;
      },
    },
    tabDiscarderStorage: {
      keys: {
        THEME: "theme",
        PROTECT_PINNED: "protectPinned",
        PROTECT_AUDIBLE: "protectAudible",
        PROTECTED_DOMAINS: "protectedDomains",
      },
      async getProtectionSettings() {
        return settings;
      },
      async set(key, value) {
        savedSettings.push([key, value]);
        return saveResult;
      },
    },
    tabDiscarderTheme: {
      async initializeTheme() {
        return {
          preference: settings?.theme || "system",
          async setPreference(value) {
            savedSettings.push(["theme", value]);
            return saveResult;
          },
        };
      },
    },
    window: { matchMedia() { return null; } },
  };
  context.globalThis = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../options/options.js"), "utf8"),
    context,
  );

  return { elements, savedSettings };
}

test("registers the focused options page in the manifest", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"),
  );

  assert.equal(manifest.options_page, "options/options.html");
});

test("uses a neutral light-theme control accent and restrained red focus", () => {
  assert.match(
    optionsCss,
    /:root\s*\{[\s\S]*?--accent:\s*#475569;[\s\S]*?--focus:\s*#b91c1c;/,
  );
  assert.match(optionsCss, /\[data-theme="light"\]\s+input\[type="checkbox"\]\s*\{[\s\S]*?accent-color:\s*var\(--accent\);/);
  assert.match(
    optionsCss,
    /\[data-theme="light"\]\s+button:focus-visible,[\s\S]*?\[data-theme="light"\]\s+input:focus-visible,[\s\S]*?\[data-theme="light"\]\s+select:focus-visible\s*\{[\s\S]*?outline:\s*2px solid var\(--focus\);/,
  );
});

test("loads saved protection choices and persists only the changed setting", async () => {
  const options = loadOptions({
    settings: { protectPinned: false, protectAudible: true },
  });

  await new Promise((resolve) => setImmediate(resolve));
  const pinnedInput = options.elements.get("protectPinned");
  const audibleInput = options.elements.get("protectAudible");

  assert.equal(pinnedInput.checked, false);
  assert.equal(audibleInput.checked, true);

  pinnedInput.checked = true;
  await pinnedInput.getListener("change")();

  assert.deepEqual(options.savedSettings, [["protectPinned", true]]);
  assert.equal(options.elements.get("settingsStatus").textContent, "Settings saved.");
});

test("loads and persists the system, light, and dark theme preference", async () => {
  const options = loadOptions({
    settings: { theme: "system", protectPinned: true, protectAudible: true },
  });

  await new Promise((resolve) => setImmediate(resolve));
  const themeInput = options.elements.get("themePreference");
  assert.equal(themeInput.value, "system");

  themeInput.value = "dark";
  await themeInput.getListener("change")();

  assert.deepEqual(options.savedSettings, [["theme", "dark"]]);
  assert.equal(options.elements.get("settingsStatus").textContent, "Settings saved.");
});

test("adds, normalizes, and removes protected domains", async () => {
  const options = loadOptions({
    settings: {
      protectPinned: true,
      protectAudible: true,
      protectedDomains: ["Example.com.", "docs.example.com"],
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  const list = options.elements.get("protectedDomainsList");
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].children[0].textContent, "docs.example.com");
  assert.equal(list.children[1].children[0].textContent, "example.com");

  const input = options.elements.get("protectedDomainInput");
  input.value = "Work.Example.com";
  options.elements.get("protectedDomainForm").getListener("submit")({
    preventDefault() {},
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(Array.from(options.savedSettings.at(-1), (value) =>
    Array.isArray(value) ? Array.from(value) : value,
  ), [
    "protectedDomains",
    ["docs.example.com", "example.com", "work.example.com"],
  ]);
  assert.equal(list.children.length, 3);
  assert.equal(options.elements.get("settingsStatus").textContent, "Protected site added.");

  await list.children[0].children[1].getListener("click")();
  assert.deepEqual(Array.from(options.savedSettings.at(-1), (value) =>
    Array.isArray(value) ? Array.from(value) : value,
  ), [
    "protectedDomains",
    ["example.com", "work.example.com"],
  ]);
  assert.equal(list.children.length, 2);
  assert.equal(options.elements.get("settingsStatus").textContent, "Protected site removed.");
});
