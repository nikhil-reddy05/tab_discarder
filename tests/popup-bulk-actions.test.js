const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createElement() {
  const listeners = new Map();

  return {
    checked: false,
    disabled: false,
    textContent: "",
    value: "",
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    getListener(type) {
      return listeners.get(type);
    },
  };
}

function loadPopup({ tabs, discardTabs }) {
  const elements = new Map(
    [
      "toggleTheme",
      "tabSummary",
      "tabList",
      "tabSearch",
      "sleepOtherTabs",
      "sleepThisWindow",
      "bulkActionStatus",
    ].map((id) => [id, createElement()]),
  );
  const queryCalls = [];
  const renderCalls = [];

  const context = {
    chrome: {
      tabs: {
        async query(queryInfo) {
          queryCalls.push(queryInfo);
          return tabs;
        },
      },
    },
    document: {
      documentElement: { setAttribute() {} },
      getElementById(id) {
        return elements.get(id);
      },
    },
    window: { localStorage: { getItem() {}, removeItem() {} } },
    tabDiscarderStorage: {
      keys: { THEME: "theme" },
      async get() {
        return "light";
      },
      async set() {
        return true;
      },
    },
    tabDiscarderTabState: {
      states: { SLEEPING: "sleeping" },
      deriveTabState(tab) {
        return tab.discarded ? "sleeping" : "awake";
      },
    },
    tabDiscarderTabFilter: { filterTabs: (currentTabs) => currentTabs },
    tabDiscarderDiscardService: {
      discardTab: async () => ({}),
      discardTabs,
      resultStatuses: { SUCCESS: "success", SKIPPED: "skipped", ERROR: "error" },
    },
    tabDiscarderTabList: {
      renderTabList(_list, renderedTabs) {
        renderCalls.push(renderedTabs);
      },
      renderTabListError() {},
      renderTabListNoResults() {},
    },
  };
  context.globalThis = context;

  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../popup/popup.js"), "utf8"),
    context,
  );

  return { elements, queryCalls, renderCalls };
}

test("Sleep this window uses the shared current-window batch action", async () => {
  const tabs = [
    { id: 1, active: true },
    { id: 2, active: false },
    { id: 3, pinned: true },
  ];
  const discardCalls = [];
  const popup = loadPopup({
    tabs,
    async discardTabs(tabIds) {
      discardCalls.push(tabIds);
      return { summary: { discarded: 1, skipped: 2, failed: 0 } };
    },
  });

  await popup.elements.get("sleepThisWindow").getListener("click")();

  assert.deepEqual(discardCalls, [[1, 2, 3]]);
  assert.equal(popup.queryCalls.length, 3);
  assert.ok(popup.queryCalls.every((query) => query.currentWindow === true));
  assert.equal(popup.elements.get("sleepOtherTabs").disabled, false);
  assert.equal(popup.elements.get("sleepThisWindow").disabled, false);
  assert.equal(popup.elements.get("bulkActionStatus").textContent, "1 slept · 2 skipped");
  assert.ok(popup.renderCalls.length > 0);
});
