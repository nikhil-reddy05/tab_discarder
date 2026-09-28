const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadTheme() {
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../lib/theme.js"), "utf8"),
    context,
  );
  return context.tabDiscarderTheme;
}

function createMediaQuery(matches) {
  const listeners = new Set();

  return {
    matches,
    addEventListener(type, listener) {
      assert.equal(type, "change");
      listeners.add(listener);
    },
    removeEventListener(type, listener) {
      assert.equal(type, "change");
      listeners.delete(listener);
    },
    emit(nextMatches) {
      this.matches = nextMatches;
      for (const listener of listeners) {
        listener({ matches: nextMatches });
      }
    },
  };
}

function createStorage(storedTheme) {
  const values = { theme: storedTheme };

  return {
    keys: { THEME: "theme" },
    values,
    async get(key) {
      return values[key];
    },
    async set(key, value) {
      values[key] = value;
      return true;
    },
  };
}

function createDocument() {
  return { documentElement: { dataset: {} } };
}

test("defaults to system and resolves it from the current media query", async () => {
  const theme = loadTheme();
  const darkMediaQuery = createMediaQuery(true);
  const darkDocument = createDocument();
  const darkController = await theme.initializeTheme({
    storage: createStorage(undefined),
    documentScope: darkDocument,
    windowScope: { matchMedia() { return darkMediaQuery; } },
  });

  assert.equal(darkController.preference, "system");
  assert.equal(darkDocument.documentElement.dataset.theme, "dark");

  const lightMediaQuery = createMediaQuery(false);
  const lightDocument = createDocument();
  await theme.initializeTheme({
    storage: createStorage(undefined),
    documentScope: lightDocument,
    windowScope: { matchMedia() { return lightMediaQuery; } },
  });
  assert.equal(lightDocument.documentElement.dataset.theme, "light");
});

test("explicit stored light and dark preferences override the system", async () => {
  const theme = loadTheme();

  assert.equal(theme.resolveTheme("light", createMediaQuery(true)), "light");
  assert.equal(theme.resolveTheme("dark", createMediaQuery(false)), "dark");

  for (const preference of ["light", "dark"]) {
    const documentScope = createDocument();
    const controller = await theme.initializeTheme({
      storage: createStorage(preference),
      documentScope,
      windowScope: { matchMedia() { return createMediaQuery(preference === "light"); } },
    });

    assert.equal(controller.preference, preference);
    assert.equal(documentScope.documentElement.dataset.theme, preference);
  }
});

test("media-query changes only update an active system preference", async () => {
  const theme = loadTheme();
  const mediaQuery = createMediaQuery(false);
  const documentScope = createDocument();
  const storage = createStorage(undefined);
  const controller = await theme.initializeTheme({
    storage,
    documentScope,
    windowScope: { matchMedia() { return mediaQuery; } },
  });

  mediaQuery.emit(true);
  assert.equal(documentScope.documentElement.dataset.theme, "dark");

  await controller.setPreference("light");
  mediaQuery.emit(true);
  assert.equal(documentScope.documentElement.dataset.theme, "light");
  assert.equal(storage.values.theme, "light");
});

test("migrates legacy light or dark values once while preserving explicit overrides", async () => {
  const theme = loadTheme();
  const storage = createStorage(undefined);
  const legacyValues = new Map([["theme", "dark"]]);
  const windowScope = {
    matchMedia() { return createMediaQuery(false); },
    localStorage: {
      getItem(key) { return legacyValues.get(key) || null; },
      removeItem(key) { legacyValues.delete(key); },
    },
  };

  const controller = await theme.initializeTheme({
    storage,
    documentScope: createDocument(),
    windowScope,
  });

  assert.equal(controller.preference, "dark");
  assert.equal(storage.values.theme, "dark");
  assert.equal(legacyValues.has("theme"), false);
});
