const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadStorage({ values = {}, failGet = false } = {}) {
  const context = {
    chrome: {
      storage: {
        local: {
          async get(keys) {
            if (failGet) {
              throw new Error("Storage unavailable");
            }

            const requestedKeys = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(
              requestedKeys.map((key) => [key, values[key]]),
            );
          },
          async set(nextValues) {
            Object.assign(values, nextValues);
          },
        },
      },
    },
  };
  context.globalThis = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../lib/storage.js"), "utf8"),
    context,
  );
  return context.tabDiscarderStorage;
}

async function readProtectionSettings(storage) {
  const settings = await storage.getProtectionSettings();
  return {
    protectPinned: settings.protectPinned,
    protectAudible: settings.protectAudible,
    protectedDomains: Array.from(settings.protectedDomains),
  };
}

test("uses safe protection defaults when settings have not been saved", async () => {
  const storage = loadStorage();

  assert.deepEqual(
    await readProtectionSettings(storage),
    { protectPinned: true, protectAudible: true, protectedDomains: [] },
  );
});

test("reads each persisted protection setting independently", async () => {
  const storage = loadStorage({
    values: {
      protectPinned: false,
      protectAudible: true,
      protectedDomains: ["example.com"],
    },
  });

  assert.deepEqual(
    await readProtectionSettings(storage),
    {
      protectPinned: false,
      protectAudible: true,
      protectedDomains: ["example.com"],
    },
  );
});

test("falls back to safe protection defaults when storage cannot be read", async () => {
  const storage = loadStorage({ failGet: true });

  assert.deepEqual(
    await readProtectionSettings(storage),
    { protectPinned: true, protectAudible: true, protectedDomains: [] },
  );
});
