const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const storageScript = fs.readFileSync(
  path.join(__dirname, "../lib/storage.js"),
  "utf8",
);
const tabStateScript = fs.readFileSync(
  path.join(__dirname, "../lib/tab-state.js"),
  "utf8",
);

function readPageScript(page) {
  return fs.readFileSync(path.join(__dirname, `../${page}/${page}.js`), "utf8");
}

function createElement() {
  return {
    checked: false,
    disabled: false,
    hidden: false,
    textContent: "",
    value: "",
    addEventListener() {},
    replaceChildren() {},
  };
}

function createSharedPageContext() {
  const elements = new Map(
    [
      "toggleTheme",
      "tabSummary",
      "tabList",
      "tabSearch",
      "groupsSection",
      "groupsList",
      "recentlyAwakenedSection",
      "recentlyAwakenedList",
      "sleepOtherTabs",
      "sleepThisWindow",
      "sleepThisGroup",
      "openOptions",
      "bulkActionStatus",
      "protectPinned",
      "protectAudible",
      "protectedDomainForm",
      "protectedDomainInput",
      "protectedDomainsList",
      "settingsStatus",
    ].map((id) => [id, createElement()]),
  );
  let currentWindowQueryCount = 0;

  const context = {
    chrome: {
      tabs: {
        async query() {
          currentWindowQueryCount += 1;
          return [
            {
              id: 1,
              windowId: 1,
              groupId: -1,
              active: true,
              discarded: false,
            },
          ];
        },
        async get() {
          return { id: 1, windowId: 1, discarded: false };
        },
      },
      tabGroups: { async query() { return []; } },
      storage: {
        local: {
          async get(keys) {
            const requestedKeys = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(requestedKeys.map((key) => [key, undefined]));
          },
          async set() {},
        },
        session: { async get() { return {}; } },
      },
    },
    document: {
      documentElement: { setAttribute() {} },
      getElementById(id) {
        return elements.get(id);
      },
    },
    window: { localStorage: { getItem() { return null; }, removeItem() {} } },
    tabDiscarderTabState: {
      states: { SLEEPING: "sleeping" },
      deriveTabState() { return "awake"; },
    },
    tabDiscarderTabFilter: { filterTabs(tabs) { return tabs; } },
    tabDiscarderDiscardService: {
      async discardTabs() {
        return { results: [], summary: { discarded: 0, skipped: 0, failed: 0 } };
      },
      resultStatuses: { SUCCESS: "success", SKIPPED: "skipped", ERROR: "error" },
    },
    tabDiscarderTabList: {
      renderTabList() {},
      renderTabListError() {},
      renderTabListNoResults() {},
    },
    tabDiscarderGroupList: {
      isGroupedTab() { return false; },
      getUngroupedTabs(tabs) { return tabs; },
      buildGroupSummaries() { return []; },
      renderGroupList() {},
    },
    tabDiscarderRecentlyAwakenedState: {
      sessionStorageKey: "recentlyAwakenedState",
      getRecentlyAwakenedRecords() { return []; },
    },
    tabDiscarderRecentlyAwakenedList: { renderRecentlyAwakenedList() {} },
  };
  context.globalThis = context;

  return {
    context: vm.createContext(context),
    elements,
    getCurrentWindowQueryCount: () => currentWindowQueryCount,
  };
}

async function loadSharedPageScripts(page) {
  const sharedPage = createSharedPageContext();

  vm.runInContext(storageScript, sharedPage.context, { filename: "lib/storage.js" });
  if (page === "options") {
    vm.runInContext(tabStateScript, sharedPage.context, {
      filename: "lib/tab-state.js",
    });
  }
  vm.runInContext(readPageScript(page), sharedPage.context, {
    filename: `${page}/${page}.js`,
  });
  await new Promise((resolve) => setImmediate(resolve));

  return sharedPage;
}

test("storage.js and popup.js load and initialize in one classic-script global", async () => {
  const popup = await loadSharedPageScripts("popup");

  assert.ok(popup.getCurrentWindowQueryCount() > 0);
  assert.equal(popup.elements.get("tabSummary").textContent, "1 awake · 0 sleeping");
});

test("storage.js and options.js load and initialize in one classic-script global", async () => {
  const options = await loadSharedPageScripts("options");

  assert.equal(options.elements.get("protectPinned").checked, true);
  assert.equal(options.elements.get("protectAudible").checked, true);
});
