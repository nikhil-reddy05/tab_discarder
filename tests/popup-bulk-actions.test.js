const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const tabStateModel = require("../lib/tab-state.js");
const { discardTabs: discardTabsWithPolicy } = require("../lib/discard-service.js");

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

function createEvent() {
  const listeners = [];

  return {
    addListener(listener) {
      listeners.push(listener);
    },
    emit(...args) {
      for (const listener of listeners) {
        listener(...args);
      }
    },
    getListenerCount() {
      return listeners.length;
    },
  };
}

function createLiveDiscardTabs(tabs, chromeDiscardCalls) {
  const tabsApi = {
    async get(tabId) {
      const tab = tabs.find((candidate) => candidate.id === tabId);
      if (!tab) {
        throw new Error(`No tab with id: ${tabId}`);
      }
      return tab;
    },
    async discard(tabId) {
      chromeDiscardCalls.push(tabId);
      const tab = tabs.find((candidate) => candidate.id === tabId);
      tab.discarded = true;
      return tab;
    },
  };

  return (tabIds, options) =>
    discardTabsWithPolicy(tabIds, {
      ...options,
      tabsApi,
      tabStateModel,
    });
}

function loadPopup({
  tabs,
  tabGroups = [],
  groupTabs = [],
  recentlyAwakenedState = { recentlyAwakenedTabs: {} },
  protectionSettings = { protectPinned: true, protectAudible: true },
  discardTabs,
}) {
  const elements = new Map(
    [
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
    ].map((id) => [id, createElement()]),
  );
  const queryCalls = [];
  const groupQueryCalls = [];
  const renderCalls = [];
  const groupRenderCalls = [];
  const recentlyAwakenedRenderCalls = [];
  let openOptionsPageCallCount = 0;
  let singleTabSleep;
  let groupSleep;
  let recentlyAwakenedSleep;
  const scheduledTimers = [];
  const tabEvents = {
    onActivated: createEvent(),
    onAttached: createEvent(),
    onCreated: createEvent(),
    onDetached: createEvent(),
    onMoved: createEvent(),
    onRemoved: createEvent(),
    onReplaced: createEvent(),
    onUpdated: createEvent(),
  };
  const tabGroupEvents = {
    onCreated: createEvent(),
    onMoved: createEvent(),
    onRemoved: createEvent(),
    onUpdated: createEvent(),
  };

  const context = {
    chrome: {
      tabs: {
        ...tabEvents,
        async query(queryInfo) {
          queryCalls.push(queryInfo);
          if (Number.isInteger(queryInfo.groupId)) {
            return groupTabs;
          }
          return tabs;
        },
        async get(tabId) {
          const tab = tabs.find((candidate) => candidate.id === tabId);
          if (!tab) {
            throw new Error("Tab not found");
          }
          return tab;
        },
      },
      tabGroups: {
        ...tabGroupEvents,
        async query(queryInfo) {
          groupQueryCalls.push(queryInfo);
          return tabGroups;
        },
      },
      runtime: {
        async openOptionsPage() {
          openOptionsPageCallCount += 1;
        },
      },
      storage: {
        session: {
          async get() {
            return { recentlyAwakenedState };
          },
        },
      },
    },
    document: {
      documentElement: { dataset: {}, setAttribute() {} },
      getElementById(id) {
        return elements.get(id);
      },
    },
    window: {},
    setTimeout(callback, delay) {
      const timer = { callback, cancelled: false, delay };
      scheduledTimers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.cancelled = true;
    },
    tabDiscarderStorage: {
      keys: {
        PROTECT_PINNED: "protectPinned",
        PROTECT_AUDIBLE: "protectAudible",
      },
      async get() {
        return "light";
      },
      async set() {
        return true;
      },
      async getProtectionSettings() {
        return protectionSettings;
      },
    },
    tabDiscarderTheme: {
      async initializeTheme() {
        return { preference: "system", async setPreference() { return true; } };
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
    tabDiscarderRecentlyAwakenedState: {
      sessionStorageKey: "recentlyAwakenedState",
      getRecentlyAwakenedRecords(state) {
        return Object.values(state?.recentlyAwakenedTabs || {}).sort(
          (left, right) => right.awakenedAt - left.awakenedAt,
        );
      },
    },
    tabDiscarderRecentlyAwakenedList: {
      renderRecentlyAwakenedList(
        _list,
        entries,
        _tabStateModel,
        _tabListRenderer,
        onSleepAgain,
      ) {
        recentlyAwakenedRenderCalls.push(entries);
        recentlyAwakenedSleep = onSleepAgain;
      },
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
    recentlyAwakenedRenderCalls,
    tabEvents,
    tabGroupEvents,
    getScheduledRefreshCount: () =>
      scheduledTimers.filter((timer) => !timer.cancelled).length,
    getScheduledRefreshDelay: () =>
      scheduledTimers.find((timer) => !timer.cancelled)?.delay,
    async runScheduledRefreshes() {
      const pendingTimers = scheduledTimers.splice(0);
      for (const timer of pendingTimers) {
        if (!timer.cancelled) {
          timer.callback();
        }
      }
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    },
    getLiveUpdateListenerCounts: () => ({
      tabs: Object.fromEntries(
        Object.entries(tabEvents).map(([name, event]) => [name, event.getListenerCount()]),
      ),
      tabGroups: Object.fromEntries(
        Object.entries(tabGroupEvents).map(([name, event]) => [name, event.getListenerCount()]),
      ),
    }),
    getOpenOptionsPageCallCount: () => openOptionsPageCallCount,
    sleepSingleTab: (...args) => singleTabSleep(...args),
    sleepGroup: (...args) => groupSleep(...args),
    sleepRecentlyAwakenedTab: (...args) => recentlyAwakenedSleep(...args),
  };
}

test("opens the extension options page from the popup settings control", async () => {
  const popup = loadPopup({
    tabs: [],
    async discardTabs() {
      return { summary: { discarded: 0, skipped: 0, failed: 0 } };
    },
  });

  await popup.elements.get("openOptions").getListener("click")();

  assert.equal(popup.getOpenOptionsPageCallCount(), 1);
});

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
  assert.equal(popup.elements.get("bulkActionStatus").textContent, "1 discarded · 1 skipped");
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
  assert.equal(popup.elements.get("bulkActionStatus").textContent, "1 discarded · 1 skipped");
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

test("Sleep other tabs and Sleep this window share the current-window batch action", async () => {
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

  await popup.elements.get("sleepOtherTabs").getListener("click")();

  assert.deepEqual(discardCalls, [[1, 2, 3]]);
  assert.equal(popup.queryCalls.length, 3);
  assert.ok(popup.queryCalls.every((query) => query.currentWindow === true));
  assert.equal(popup.elements.get("sleepOtherTabs").disabled, false);
  assert.equal(popup.elements.get("sleepThisWindow").disabled, false);
  assert.equal(popup.elements.get("bulkActionStatus").textContent, "1 discarded · 2 skipped");

  await popup.elements.get("sleepThisWindow").getListener("click")();

  assert.deepEqual(discardCalls, [[1, 2, 3], [1, 2, 3]]);
  assert.equal(popup.queryCalls.length, 5);
  assert.ok(popup.renderCalls.length > 0);
});

test("single-tab Sleep uses the current protection policy and refreshes the window", async () => {
  const tabs = [{ id: 2, active: false, discarded: false }];
  const discardCalls = [];
  const popup = loadPopup({
    tabs,
    protectionSettings: { protectPinned: false, protectAudible: true },
    async discardTabs(tabIds, options) {
      discardCalls.push({ tabIds, options });
      return {
        results: [{ status: "success", tabId: 2 }],
        summary: { discarded: 1, skipped: 0, failed: 0 },
      };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  await popup.sleepSingleTab(2);

  assert.deepEqual(Array.from(discardCalls[0].tabIds), [2]);
  assert.deepEqual(discardCalls[0].options.policy, {
    protectPinned: false,
    protectAudible: true,
  });
  assert.equal(popup.queryCalls.length, 2);
  assert.ok(popup.queryCalls.every((query) => query.currentWindow === true));
  assert.equal(popup.elements.get("bulkActionStatus").textContent, "Tab discarded.");
});

test("single-tab Sleep keeps the first success when discard returns a replacement tab", async () => {
  const tabA = { id: 31, windowId: 7, groupId: -1, active: false };
  const discardedTabB = {
    id: 32,
    windowId: 7,
    groupId: -1,
    active: false,
    discarded: true,
  };
  const tabs = [tabA];
  const getCalls = [];
  const chromeDiscardCalls = [];
  const tabsApi = {
    async get(tabId) {
      getCalls.push(tabId);
      if (tabId !== tabA.id) {
        throw new Error(`No tab with id: ${tabId}`);
      }
      return tabA;
    },
    async discard(tabId) {
      chromeDiscardCalls.push(tabId);
      return discardedTabB;
    },
  };
  const popup = loadPopup({
    tabs,
    discardTabs(tabIds, options) {
      return discardTabsWithPolicy(tabIds, {
        ...options,
        tabsApi,
        tabStateModel,
      });
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  const result = await popup.sleepSingleTab(tabA.id);

  assert.deepEqual(getCalls, [tabA.id]);
  assert.deepEqual(chromeDiscardCalls, [tabA.id]);
  assert.equal(result.status, "success");
  assert.equal(result.tabId, discardedTabB.id);
  assert.equal(popup.elements.get("bulkActionStatus").textContent, "Tab discarded.");
});

test("single-tab Sleep retries only after a genuine missing-tab result is mapped", async () => {
  const tabA = { id: 36, windowId: 7, groupId: -1, active: false };
  const tabB = { id: 37, windowId: 7, groupId: -1, active: false };
  const tabs = [tabA];
  const discardCalls = [];
  let popup;
  popup = loadPopup({
    tabs,
    async discardTabs(tabIds) {
      discardCalls.push(Array.from(tabIds));
      if (discardCalls.length === 1) {
        tabs.splice(0, 1, tabB);
        popup.tabEvents.onReplaced.emit(tabB.id, tabA.id);
        return {
          results: [
            {
              status: "error",
              tabId: tabA.id,
              error: { message: `No tab with id: ${tabA.id}` },
            },
          ],
          summary: { discarded: 0, skipped: 0, failed: 1 },
        };
      }

      return {
        results: [{ status: "success", tabId: tabB.id }],
        summary: { discarded: 1, skipped: 0, failed: 0 },
      };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  const result = await popup.sleepSingleTab(tabA.id);

  assert.deepEqual(discardCalls, [[tabA.id], [tabB.id]]);
  assert.equal(result.status, "success");
  assert.equal(popup.elements.get("bulkActionStatus").textContent, "Tab discarded.");
});

test("single-tab Sleep resolves a replaced row ID before the normal live refresh delay", async () => {
  const tabA = { id: 41, windowId: 7, groupId: -1, active: false };
  const tabB = { id: 42, windowId: 7, groupId: -1, active: false };
  const tabs = [tabA];
  const chromeDiscardCalls = [];
  const popup = loadPopup({
    tabs,
    discardTabs: createLiveDiscardTabs(tabs, chromeDiscardCalls),
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    Array.from(popup.renderCalls[0], (tab) => tab.id),
    [tabA.id],
  );
  tabs.splice(0, 1, tabB);
  const queryCountBeforeReplacement = popup.queryCalls.length;
  popup.tabEvents.onReplaced.emit(tabB.id, tabA.id);

  // onReplaced must reconcile now, rather than enqueueing the usual 100 ms
  // refresh that would leave a rendered closure holding tab A's stale ID.
  assert.equal(popup.getScheduledRefreshCount(), 0);
  assert.ok(popup.queryCalls.length > queryCountBeforeReplacement);

  await popup.sleepSingleTab(tabA.id);

  assert.deepEqual(chromeDiscardCalls, [tabB.id]);
  assert.equal(popup.elements.get("bulkActionStatus").textContent, "Tab discarded.");
});

test("single-tab Sleep keeps live protection checks when the replacement is active", async () => {
  const tabA = { id: 51, windowId: 7, groupId: -1, active: false };
  const activeTabB = { id: 52, windowId: 7, groupId: -1, active: true };
  const tabs = [tabA];
  const chromeDiscardCalls = [];
  const popup = loadPopup({
    tabs,
    discardTabs: createLiveDiscardTabs(tabs, chromeDiscardCalls),
  });

  await new Promise((resolve) => setImmediate(resolve));
  tabs.splice(0, 1, activeTabB);
  popup.tabEvents.onReplaced.emit(activeTabB.id, tabA.id);

  await popup.sleepSingleTab(tabA.id);

  assert.deepEqual(chromeDiscardCalls, []);
  assert.equal(
    popup.elements.get("bulkActionStatus").textContent,
    "Tab is currently protected and was not discarded.",
  );
});

test("single-tab Sleep keeps pinned replacement tabs protected", async () => {
  const tabA = { id: 55, windowId: 7, groupId: -1, active: false };
  const pinnedTabB = {
    id: 56,
    windowId: 7,
    groupId: -1,
    active: false,
    pinned: true,
  };
  const tabs = [tabA];
  const chromeDiscardCalls = [];
  const popup = loadPopup({
    tabs,
    discardTabs: createLiveDiscardTabs(tabs, chromeDiscardCalls),
  });

  await new Promise((resolve) => setImmediate(resolve));
  tabs.splice(0, 1, pinnedTabB);
  popup.tabEvents.onReplaced.emit(pinnedTabB.id, tabA.id);

  await popup.sleepSingleTab(tabA.id);

  assert.deepEqual(chromeDiscardCalls, []);
  assert.equal(
    popup.elements.get("bulkActionStatus").textContent,
    "Tab is currently protected and was not discarded.",
  );
});

test("single-tab Sleep safely follows a chain of tab replacements", async () => {
  const tabA = { id: 61, windowId: 7, groupId: -1, active: false };
  const tabB = { id: 62, windowId: 7, groupId: -1, active: false };
  const tabC = { id: 63, windowId: 7, groupId: -1, active: false };
  const tabs = [tabA];
  const discardCalls = [];
  const popup = loadPopup({
    tabs,
    async discardTabs(tabIds) {
      discardCalls.push(tabIds);
      return {
        results: [{ status: "success", tabId: tabIds[0] }],
        summary: { discarded: 1, skipped: 0, failed: 0 },
      };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  tabs.splice(0, 1, tabB);
  popup.tabEvents.onReplaced.emit(tabB.id, tabA.id);
  tabs.splice(0, 1, tabC);
  popup.tabEvents.onReplaced.emit(tabC.id, tabB.id);

  await popup.sleepSingleTab(tabA.id);

  assert.deepEqual(Array.from(discardCalls[0]), [tabC.id]);
});

test("a replacement that disappears is reported as stale UI instead of a discard failure", async () => {
  const tabA = { id: 71, windowId: 7, groupId: -1, active: false };
  const tabB = { id: 72, windowId: 7, groupId: -1, active: false };
  const tabs = [tabA];
  const discardCalls = [];
  const popup = loadPopup({
    tabs,
    async discardTabs(tabIds) {
      discardCalls.push(tabIds);
      return {
        results: [
          {
            status: "error",
            tabId: tabIds[0],
            error: { message: `No tab with id: ${tabIds[0]}` },
          },
        ],
        summary: { discarded: 0, skipped: 0, failed: 1 },
      };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  tabs.splice(0, 1, tabB);
  popup.tabEvents.onReplaced.emit(tabB.id, tabA.id);

  const result = await popup.sleepSingleTab(tabA.id);

  assert.deepEqual(Array.from(discardCalls[0]), [tabB.id]);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "stale-tab");
  assert.equal(
    popup.elements.get("bulkActionStatus").textContent,
    "Tab changed before it could be discarded.",
  );
});

test("window and group sleep actions use the latest stored protection policy", async () => {
  const discardCalls = [];
  const popup = loadPopup({
    tabs: [
      { id: 1, windowId: 7, groupId: 3, active: true },
      { id: 2, windowId: 7, groupId: 3, pinned: true },
    ],
    tabGroups: [{ id: 3, title: "Research", color: "blue" }],
    groupTabs: [{ id: 2, windowId: 7, groupId: 3, pinned: true }],
    protectionSettings: { protectPinned: false, protectAudible: true },
    async discardTabs(tabIds, options) {
      discardCalls.push({ tabIds, options });
      return { summary: { discarded: 1, skipped: 0, failed: 0 } };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  await popup.sleepGroup(3);
  await popup.elements.get("sleepThisWindow").getListener("click")();

  assert.deepEqual(discardCalls[0].options.policy, {
    protectPinned: false,
    protectAudible: true,
  });
  assert.deepEqual(discardCalls[1].options.policy, {
    protectPinned: false,
    protectAudible: true,
  });
});

test("Sleep again uses the policy-aware shared batch service and refreshes Recent", async () => {
  const discardCalls = [];
  const tabs = [
    { id: 1, windowId: 7, active: true, discarded: false, groupId: -1 },
    { id: 2, windowId: 7, active: false, discarded: false, groupId: -1 },
  ];
  const popup = loadPopup({
    tabs,
    recentlyAwakenedState: {
      recentlyAwakenedTabs: {
        1: { tabId: 1, windowId: 7, awakenedAt: 100 },
        2: { tabId: 2, windowId: 7, awakenedAt: 200 },
      },
    },
    async discardTabs(tabIds) {
      discardCalls.push(tabIds);
      tabs[1].discarded = true;
      return {
        results: [{ status: "success", tabId: 2 }],
        summary: { discarded: 1, skipped: 0, failed: 0 },
      };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(popup.elements.get("recentlyAwakenedSection").hidden, false);
  assert.deepEqual(
    Array.from(popup.recentlyAwakenedRenderCalls[0], (entry) => entry.tab.id),
    [2, 1],
  );

  await popup.sleepRecentlyAwakenedTab(2);

  assert.deepEqual(Array.from(discardCalls, (tabIds) => Array.from(tabIds)), [[2]]);
  assert.equal(popup.elements.get("bulkActionStatus").textContent, "Tab discarded again.");
  assert.ok(popup.recentlyAwakenedRenderCalls.length > 1);
  assert.deepEqual(
    Array.from(
      popup.recentlyAwakenedRenderCalls.at(-1),
      (entry) => entry.tab.id,
    ),
    [1],
  );
});

test("closed recent tabs are removed from the popup list", async () => {
  const popup = loadPopup({
    tabs: [{ id: 1, windowId: 7, active: true, groupId: -1 }],
    recentlyAwakenedState: {
      recentlyAwakenedTabs: {
        2: { tabId: 2, windowId: 7, awakenedAt: 200 },
      },
    },
    async discardTabs() {
      return { summary: { discarded: 0, skipped: 0, failed: 0 } };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(popup.elements.get("recentlyAwakenedSection").hidden, true);
  assert.deepEqual(
    Array.from(popup.recentlyAwakenedRenderCalls[0]),
    [],
  );
});

test("batches relevant live tab and group events into one popup refresh", async () => {
  const tabs = [
    { id: 1, windowId: 7, groupId: -1, active: true, discarded: false },
    { id: 2, windowId: 7, groupId: -1, active: false, discarded: true },
  ];
  const tabGroups = [];
  const recentlyAwakenedState = { recentlyAwakenedTabs: {} };
  const popup = loadPopup({
    tabs,
    tabGroups,
    recentlyAwakenedState,
    async discardTabs() {
      return { summary: { discarded: 0, skipped: 0, failed: 0 } };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  const initialQueryCount = popup.queryCalls.length;
  const initialGroupRenderCount = popup.groupRenderCalls.length;
  const initialRecentRenderCount = popup.recentlyAwakenedRenderCalls.length;

  assert.deepEqual(popup.getLiveUpdateListenerCounts(), {
    tabs: {
      onActivated: 1,
      onAttached: 1,
      onCreated: 1,
      onDetached: 1,
      onMoved: 1,
      onRemoved: 1,
      onReplaced: 1,
      onUpdated: 1,
    },
    tabGroups: {
      onCreated: 1,
      onMoved: 1,
      onRemoved: 1,
      onUpdated: 1,
    },
  });

  tabs[1].discarded = false;
  tabs[1].groupId = 4;
  tabGroups.push({ id: 4, title: "Research", color: "blue" });
  recentlyAwakenedState.recentlyAwakenedTabs[2] = {
    tabId: 2,
    windowId: 7,
    awakenedAt: Date.now(),
  };

  popup.tabEvents.onActivated.emit({ tabId: 1, windowId: 7 });
  popup.tabEvents.onUpdated.emit(2, { discarded: false }, tabs[1]);
  popup.tabEvents.onUpdated.emit(2, { title: "Updated title" }, tabs[1]);
  popup.tabEvents.onRemoved.emit(3, { windowId: 7, isWindowClosing: false });
  popup.tabGroupEvents.onUpdated.emit({ id: 4, title: "Research" });

  assert.equal(popup.getScheduledRefreshCount(), 1);
  assert.equal(popup.getScheduledRefreshDelay(), 100);
  await popup.runScheduledRefreshes();

  assert.equal(popup.queryCalls.length, initialQueryCount + 1);
  assert.equal(popup.groupRenderCalls.length, initialGroupRenderCount + 1);
  assert.equal(
    popup.recentlyAwakenedRenderCalls.length,
    initialRecentRenderCount + 1,
  );
  assert.equal(popup.groupRenderCalls.at(-1)[0].title, "Research");
  assert.deepEqual(
    Array.from(popup.recentlyAwakenedRenderCalls.at(-1), (entry) => entry.tab.id),
    [2],
  );
  assert.equal(popup.renderCalls.at(-1)[0].discarded, false);

  assert.deepEqual(popup.getLiveUpdateListenerCounts(), {
    tabs: {
      onActivated: 1,
      onAttached: 1,
      onCreated: 1,
      onDetached: 1,
      onMoved: 1,
      onRemoved: 1,
      onReplaced: 1,
      onUpdated: 1,
    },
    tabGroups: {
      onCreated: 1,
      onMoved: 1,
      onRemoved: 1,
      onUpdated: 1,
    },
  });
});
