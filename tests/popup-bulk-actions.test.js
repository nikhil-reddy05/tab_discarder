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

function loadPopup({ tabs, discardTabs, discardTab = async () => ({}) }) {
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
  let singleTabSleep;

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
      discardTab,
      discardTabs,
      resultStatuses: { SUCCESS: "success", SKIPPED: "skipped", ERROR: "error" },
    },
    tabDiscarderTabList: {
      renderTabList(_list, renderedTabs, _tabStateModel, onSleep) {
        renderCalls.push(renderedTabs);
        singleTabSleep = onSleep;
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

  return {
    elements,
    queryCalls,
    renderCalls,
    sleepSingleTab: (...args) => singleTabSleep(...args),
  };
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

test("single-tab Sleep refreshes the current window after the discard attempt", async () => {
  const tabs = [{ id: 2, active: false, discarded: false }];
  const discardCalls = [];
  const popup = loadPopup({
    tabs,
    async discardTab(tabId) {
      discardCalls.push(tabId);
      return { status: "success", tabId, tab: { ...tabs[0], discarded: true } };
    },
    async discardTabs() {
      return { summary: { discarded: 0, skipped: 0, failed: 0 } };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  await popup.sleepSingleTab(2);

  assert.deepEqual(discardCalls, [2]);
  assert.equal(popup.queryCalls.length, 2);
  assert.ok(popup.queryCalls.every((query) => query.currentWindow === true));
  assert.equal(popup.elements.get("bulkActionStatus").textContent, "Tab slept.");
});
