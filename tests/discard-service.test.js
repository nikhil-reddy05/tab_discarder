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

test("manually discards a tab and confirms its state afterward", async () => {
  const tab = { id: 17, active: false, discarded: false };
  const discardedTab = { ...tab, discarded: true };
  const tabsApi = createTabsApi(tab, {
    discardResult: discardedTab,
    getResults: [discardedTab],
  });

  const result = await discardTab(17, { tabsApi, tabStateModel });

  assert.deepEqual(tabsApi.calls, [
    ["discard", 17],
    ["get", 17],
  ]);
  assert.deepEqual(result, {
    status: resultStatuses.SUCCESS,
    tabId: 17,
    tab: discardedTab,
  });
});

test("returns an error without fabricating a sleeping tab when discard is unconfirmed", async () => {
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

test("returns an error when the post-discard tab fetch is still awake", async () => {
  const tab = { id: 23, active: false, discarded: false };
  const tabsApi = createTabsApi(tab, {
    discardResult: { ...tab, discarded: true },
    getResults: [tab],
  });

  const result = await discardTab(23, { tabsApi, tabStateModel });

  assert.deepEqual(tabsApi.calls, [
    ["discard", 23],
    ["get", 23],
  ]);
  assert.deepEqual(result, {
    status: resultStatuses.ERROR,
    tabId: 23,
    tab,
    error: { message: "Chrome did not confirm that the tab was discarded." },
  });
});

test("manual Sleep attempts discard after switching away from a previously active tab", async () => {
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

  assert.deepEqual(calls, [["discard", 1], ["get", 1]]);
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
