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
    hidden: false,
    replaceChildren() {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    getListener(type) {
      return listeners.get(type);
    },
  };
}

function loadPopup({
  tabs,
  tabGroups = [],
  groupTabs = [],
  discardTabs,
  discardTab = async () => ({}),
}) {
  const elements = new Map(
    [
      "toggleTheme",
      "tabSummary",
      "tabList",
      "tabSearch",
      "groupsSection",
      "groupsList",
      "sleepOtherTabs",
      "sleepThisWindow",
      "sleepThisGroup",
      "bulkActionStatus",
    ].map((id) => [id, createElement()]),
  );
  const queryCalls = [];
  const groupQueryCalls = [];
  const renderCalls = [];
  const groupRenderCalls = [];
  let singleTabSleep;
  let groupSleep;

  const context = {
    chrome: {
      tabs: {
        async query(queryInfo) {
          queryCalls.push(queryInfo);
          if (Number.isInteger(queryInfo.groupId)) {
            return groupTabs;
          }
          return tabs;
        },
      },
      tabGroups: {
        async query(queryInfo) {
          groupQueryCalls.push(queryInfo);
          return tabGroups;
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
    tabDiscarderGroupList: {
      isGroupedTab(tab) {
        return Number.isInteger(tab?.groupId) && tab.groupId !== -1;
      },
      getUngroupedTabs(currentTabs) {
        return currentTabs.filter((tab) => tab.groupId === -1 || tab.groupId == null);
      },
      buildGroupSummaries(groups, currentTabs) {
        return groups.map((group) => ({
          groupId: group.id,
          title: group.title || "Untitled group",
          totalCount: currentTabs.filter((tab) => tab.groupId === group.id).length,
        }));
      },
      renderGroupList(_list, summaries, onSleepGroup) {
        groupRenderCalls.push(summaries);
        groupSleep = onSleepGroup;
      },
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
    groupQueryCalls,
    renderCalls,
    groupRenderCalls,
    sleepSingleTab: (...args) => singleTabSleep(...args),
    sleepGroup: (...args) => groupSleep(...args),
  };
}

test("loads current-window group metadata and joins it to current tabs", async () => {
  const popup = loadPopup({
    tabs: [
      { id: 1, windowId: 7, groupId: 3 },
      { id: 2, windowId: 7, groupId: -1 },
    ],
    tabGroups: [{ id: 3, title: "Research", color: "blue" }],
    async discardTabs() {
      return { summary: { discarded: 0, skipped: 0, failed: 0 } };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(popup.groupQueryCalls.length, 1);
  assert.equal(popup.groupQueryCalls[0].windowId, 7);
  assert.equal(popup.groupRenderCalls.length, 1);
  assert.equal(popup.groupRenderCalls[0][0].title, "Research");
  assert.equal(popup.groupRenderCalls[0][0].totalCount, 1);
  assert.equal(popup.elements.get("groupsSection").hidden, false);
});

test("Sleep group resolves live members and protects tabs that leave the group", async () => {
  const discardCalls = [];
  const popup = loadPopup({
    tabs: [
      { id: 1, windowId: 7, groupId: 3 },
      { id: 2, windowId: 7, groupId: 3, active: true },
      { id: 3, windowId: 7, groupId: -1 },
    ],
    tabGroups: [{ id: 3, title: "Research", color: "blue" }],
    groupTabs: [
      { id: 1, groupId: 3 },
      { id: 2, groupId: 3, active: true },
    ],
    async discardTabs(tabIds, options) {
      discardCalls.push({ tabIds, options });
      return { summary: { discarded: 1, skipped: 1, failed: 0 } };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  await popup.sleepGroup(3);

  assert.equal(
    popup.queryCalls.some((query) => query.groupId === 3),
    true,
  );
  assert.deepEqual(discardCalls[0].tabIds, [1, 2]);
  assert.equal(discardCalls[0].options.shouldDiscardTab({ groupId: 3 }), true);
  assert.equal(discardCalls[0].options.shouldDiscardTab({ groupId: 4 }), false);
  assert.equal(popup.elements.get("bulkActionStatus").textContent, "1 slept · 1 skipped");
  assert.equal(popup.groupRenderCalls.length, 2);
});

test("Sleep this group is available for an active grouped tab and reuses Sleep group", async () => {
  const discardCalls = [];
  const popup = loadPopup({
    tabs: [
      { id: 1, windowId: 7, groupId: 3 },
      { id: 2, windowId: 7, groupId: 3, active: true },
      { id: 3, windowId: 7, groupId: -1 },
    ],
    tabGroups: [{ id: 3, title: "Research", color: "blue" }],
    groupTabs: [
      { id: 1, groupId: 3 },
      { id: 2, groupId: 3, active: true },
    ],
    async discardTabs(tabIds, options) {
      discardCalls.push({ tabIds, options });
      return { summary: { discarded: 1, skipped: 1, failed: 0 } };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  const action = popup.elements.get("sleepThisGroup");
  assert.equal(action.hidden, false);
  assert.equal(action.disabled, false);

  await action.getListener("click")();

  assert.deepEqual(discardCalls[0].tabIds, [1, 2]);
  assert.equal(discardCalls[0].options.shouldDiscardTab({ groupId: 3 }), true);
  assert.equal(discardCalls[0].options.shouldDiscardTab({ groupId: -1 }), false);
  assert.equal(popup.elements.get("bulkActionStatus").textContent, "1 slept · 1 skipped");
});

test("Sleep this group is hidden for an active ungrouped tab", async () => {
  const popup = loadPopup({
    tabs: [{ id: 1, windowId: 7, groupId: -1, active: true }],
    async discardTabs() {
      return { summary: { discarded: 0, skipped: 0, failed: 0 } };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  const action = popup.elements.get("sleepThisGroup");
  assert.equal(action.hidden, true);
  assert.equal(action.disabled, true);
});

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
