const test = require("node:test");
const assert = require("node:assert/strict");

const tabStateModel = require("../lib/tab-state.js");
const {
  discardTab,
  discardTabs,
  resultStatuses,
} = require("../lib/discard-service.js");

function createTabsApi(tab, { discardResult, discardError, getError } = {}) {
  const calls = [];

  return {
    calls,
    async get(tabId) {
      calls.push(["get", tabId]);
      if (getError) {
        throw getError;
      }
      return tab;
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

test("discards an eligible tab after re-fetching its current state", async () => {
  const tab = { id: 17, active: false, discarded: false };
  const discardedTab = { ...tab, discarded: true };
  const tabsApi = createTabsApi(tab, { discardResult: discardedTab });

  const result = await discardTab(17, { tabsApi, tabStateModel });

  assert.deepEqual(tabsApi.calls, [["get", 17], ["discard", 17]]);
  assert.deepEqual(result, {
    status: resultStatuses.SUCCESS,
    tabId: 17,
    tab: discardedTab,
  });
});

test("skips protected tabs without calling the Chrome discard API", async () => {
  for (const [tab, reason] of [
    [{ id: 1, active: true }, "active"],
    [{ id: 2, discarded: true }, "sleeping"],
    [{ id: 3, audible: true }, "playing-audio"],
    [{ id: 4, pinned: true }, "pinned"],
  ]) {
    const tabsApi = createTabsApi(tab);
    const result = await discardTab(tab.id, { tabsApi, tabStateModel });

    assert.equal(result.status, resultStatuses.SKIPPED);
    assert.equal(result.reason, reason);
    assert.deepEqual(tabsApi.calls, [["get", tab.id]]);
  }
});

test("returns an error result when discarding fails without throwing", async () => {
  const tab = { id: 21, active: false, discarded: false };
  const tabsApi = createTabsApi(tab, {
    discardError: new Error("Tab cannot be discarded"),
  });

  const result = await discardTab(21, { tabsApi, tabStateModel });

  assert.deepEqual(tabsApi.calls, [["get", 21], ["discard", 21]]);
  assert.deepEqual(result, {
    status: resultStatuses.ERROR,
    tabId: 21,
    tab,
    error: { message: "Tab cannot be discarded" },
  });
});

test("continues a batch after failures and applies policy to every tab", async () => {
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
        throw new Error("Tab cannot be discarded");
      }
      return { ...tabs.get(tabId), discarded: true };
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
