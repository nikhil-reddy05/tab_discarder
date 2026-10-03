const test = require("node:test");
const assert = require("node:assert/strict");

const tabStateModel = require("../lib/tab-state.js");
const {
  discardTab,
  discardTabs,
  resultStatuses,
} = require("../lib/discard-service.js");

function createTabsApi(
  tab,
  { discardResult, discardError, getError, getResults = [] } = {},
) {
  const calls = [];
  let getResultIndex = 0;

  return {
    calls,
    async get(tabId) {
      calls.push(["get", tabId]);
      if (getError) {
        throw getError;
      }
      return getResults[getResultIndex++] || tab;
    },
    async discard(tabId) {
      calls.push(["discard", tabId]);
      if (discardError) {
        throw discardError;
      }
      return discardResult;
    },
  };
}

test("accepts Chrome's returned discarded tab without a follow-up get", async () => {
  const tab = { id: 17, active: false, discarded: false };
  const discardedTab = { ...tab, discarded: true };
  const tabsApi = createTabsApi(tab, {
    discardResult: discardedTab,
  });

  const result = await discardTab(17, { tabsApi, tabStateModel });

  assert.deepEqual(tabsApi.calls, [["discard", 17]]);
  assert.deepEqual(result, {
    status: resultStatuses.SUCCESS,
    tabId: 17,
    tab: discardedTab,
  });
});

test("returns an error without fabricating a discarded tab when discard is unconfirmed", async () => {
  const tab = { id: 22, active: false, discarded: false };
  const tabsApi = createTabsApi(tab, { discardResult: undefined });

  const result = await discardTab(22, { tabsApi, tabStateModel });

  assert.deepEqual(tabsApi.calls, [["discard", 22]]);
  assert.deepEqual(result, {
    status: resultStatuses.ERROR,
    tabId: 22,
    error: { message: "Chrome did not confirm that the tab was discarded." },
  });
});

test("uses a replacement ID returned by Chrome as the successful tab ID", async () => {
  const tabA = { id: 23, active: false, discarded: false };
  const discardedTabB = { id: 24, active: false, discarded: true };
  const tabsApi = createTabsApi(tabA, { discardResult: discardedTabB });

  const result = await discardTab(tabA.id, { tabsApi, tabStateModel });

  assert.deepEqual(tabsApi.calls, [["discard", tabA.id]]);
  assert.deepEqual(result, {
    status: resultStatuses.SUCCESS,
    tabId: discardedTabB.id,
    tab: discardedTabB,
  });
});

test("returns an error when Chrome returns an awake tab from discard", async () => {
  const tab = { id: 23, active: false, discarded: false };
  const tabsApi = createTabsApi(tab, {
    discardResult: tab,
  });

  const result = await discardTab(23, { tabsApi, tabStateModel });

  assert.deepEqual(tabsApi.calls, [["discard", 23]]);
  assert.deepEqual(result, {
    status: resultStatuses.ERROR,
    tabId: 23,
    tab,
    error: { message: "Chrome did not confirm that the tab was discarded." },
  });
});

test("manual Discard attempts discard after switching away from a previously active tab", async () => {
  const tabAWhileActive = { id: 1, active: true, discarded: false };
  const tabAAfterDiscard = { id: 1, active: false, discarded: true };
  const calls = [];
  let discardAttempted = false;
  const tabsApi = {
    async get(tabId) {
      calls.push(["get", tabId]);
      return discardAttempted ? tabAAfterDiscard : tabAWhileActive;
    },
    async discard(tabId) {
      calls.push(["discard", tabId]);
      discardAttempted = true;
      return tabAAfterDiscard;
    },
  };

  const result = await discardTab(1, { tabsApi, tabStateModel });

  assert.deepEqual(calls, [["discard", 1]]);
  assert.equal(result.status, resultStatuses.SUCCESS);
  assert.deepEqual(result.tab, tabAAfterDiscard);
});

test("returns an error result when discarding fails without throwing", async () => {
  const tab = { id: 21, active: false, discarded: false };
  const tabsApi = createTabsApi(tab, {
    discardError: new Error("Tab cannot be discarded"),
  });

  const result = await discardTab(21, { tabsApi, tabStateModel });

  assert.deepEqual(tabsApi.calls, [["discard", 21]]);
  assert.deepEqual(result, {
    status: resultStatuses.ERROR,
    tabId: 21,
    error: { message: "Tab cannot be discarded" },
  });
});

test("continues a batch after an unconfirmed discard and applies policy to every tab", async () => {
  const tabs = new Map([
    [1, { id: 1, active: true }],
    [2, { id: 2, active: false }],
    [3, { id: 3, pinned: true }],
    [4, { id: 4, active: false }],
    [5, { id: 5, discarded: true }],
    [6, { id: 6, audible: true }],
  ]);
  const discardCalls = [];
  const tabsApi = {
    async get(tabId) {
      return tabs.get(tabId);
    },
    async discard(tabId) {
      discardCalls.push(tabId);
      if (tabId === 4) {
        return undefined;
      }
      const discardedTab = { ...tabs.get(tabId), discarded: true };
      tabs.set(tabId, discardedTab);
      return discardedTab;
    },
  };

  const result = await discardTabs([...tabs.keys()], { tabsApi, tabStateModel });

  assert.deepEqual(discardCalls, [2, 4]);
  assert.deepEqual(result.summary, {
    discarded: 1,
    skipped: 4,
    failed: 1,
  });
  assert.deepEqual(
    result.results.map(({ status, tabId }) => [status, tabId]),
    [
      [resultStatuses.SKIPPED, 1],
      [resultStatuses.SUCCESS, 2],
      [resultStatuses.SKIPPED, 3],
      [resultStatuses.ERROR, 4],
      [resultStatuses.SKIPPED, 5],
      [resultStatuses.SKIPPED, 6],
    ],
  );
});

test("skips a tab that leaves a selected group before its discard is attempted", async () => {
  const tabs = new Map([
    [1, { id: 1, groupId: 20, active: true }],
    [2, { id: 2, groupId: 20, active: false }],
    [3, { id: 3, groupId: 20, pinned: true }],
    [4, { id: 4, groupId: 20, discarded: true }],
    [5, { id: 5, groupId: 21, active: false }],
  ]);
  const discardCalls = [];
  const tabsApi = {
    async get(tabId) {
      return tabs.get(tabId);
    },
    async discard(tabId) {
      discardCalls.push(tabId);
      const discardedTab = { ...tabs.get(tabId), discarded: true };
      tabs.set(tabId, discardedTab);
      return discardedTab;
    },
  };

  const result = await discardTabs([1, 2, 3, 4, 5], {
    tabsApi,
    tabStateModel,
    shouldDiscardTab: (tab) => tab.groupId === 20,
  });

  assert.deepEqual(discardCalls, [2]);
  assert.deepEqual(result.summary, {
    discarded: 1,
    skipped: 4,
    failed: 0,
  });
  assert.equal(result.results[4].reason, "no-longer-targeted");
});

test("applies a supplied protection setting without changing other protections", async () => {
  const tabs = new Map([
    [1, { id: 1, pinned: true }],
    [2, { id: 2, audible: true }],
    [3, { id: 3 }],
  ]);
  const discardCalls = [];
  const tabsApi = {
    async get(tabId) {
      return tabs.get(tabId);
    },
    async discard(tabId) {
      discardCalls.push(tabId);
      const discardedTab = { ...tabs.get(tabId), discarded: true };
      tabs.set(tabId, discardedTab);
      return discardedTab;
    },
  };

  const result = await discardTabs([1, 2, 3], {
    tabsApi,
    tabStateModel,
    policy: { protectPinned: false, protectAudible: true },
  });

  assert.deepEqual(discardCalls, [1, 3]);
  assert.deepEqual(result.summary, { discarded: 2, skipped: 1, failed: 0 });
});

test("skips protected domains in shared single and bulk discard policy", async () => {
  const tabs = new Map([
    [1, { id: 1, url: "https://example.com" }],
    [2, { id: 2, url: "https://docs.example.com" }],
    [3, { id: 3, url: "https://other.example" }],
  ]);
  const discardCalls = [];
  const tabsApi = {
    async get(tabId) {
      return tabs.get(tabId);
    },
    async discard(tabId) {
      discardCalls.push(tabId);
      const discardedTab = { ...tabs.get(tabId), discarded: true };
      tabs.set(tabId, discardedTab);
      return discardedTab;
    },
  };

  const result = await discardTabs([1, 2, 3], {
    tabsApi,
    tabStateModel,
    policy: { protectedDomains: ["example.com"] },
  });

  assert.deepEqual(discardCalls, [3]);
  assert.deepEqual(result.summary, { discarded: 1, skipped: 2, failed: 0 });
  assert.equal(result.results[0].reason, "protected-domain");
  assert.equal(result.results[1].reason, "protected-domain");
});
