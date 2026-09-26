const test = require("node:test");
const assert = require("node:assert/strict");

const {
  noEligibleRecentTabReason,
  findMostRecentEligibleAwakenedTab,
  sleepMostRecentEligibleAwakenedTab,
} = require("../lib/recent-awakened-command.js");

function createTabsApi(tabs) {
  const getCalls = [];
  const tabsById = new Map(tabs.map((tab) => [tab.id, tab]));

  return {
    getCalls,
    async get(tabId) {
      getCalls.push(tabId);
      const tab = tabsById.get(tabId);
      if (!tab) {
        throw new Error("Tab not found");
      }
      return tab;
    },
  };
}

const tabStateModel = {
  getDiscardEligibility(
    tab,
    { protectPinned = true, protectAudible = true } = {},
  ) {
    if (tab.active) {
      return { eligible: false, reason: "active" };
    }
    if (tab.pinned && protectPinned) {
      return { eligible: false, reason: "pinned" };
    }
    if (tab.audible && protectAudible) {
      return { eligible: false, reason: "playing-audio" };
    }
    if (tab.discarded) {
      return { eligible: false, reason: "sleeping" };
    }
    return { eligible: true };
  },
};

function createTracker(records) {
  return {
    async getRecentlyAwakened() {
      return records;
    },
  };
}

test("selects the newest live eligible recently awakened tab deterministically", async () => {
  const tabsApi = createTabsApi([
    { id: 1, windowId: 10, active: false },
    { id: 2, windowId: 10, active: true },
    { id: 3, windowId: 10, pinned: true },
    { id: 4, windowId: 99, active: false },
  ]);
  const tracker = createTracker([
    { tabId: 1, windowId: 10, awakenedAt: 100 },
    { tabId: 2, windowId: 10, awakenedAt: 300 },
    { tabId: 3, windowId: 10, awakenedAt: 200 },
    { tabId: 4, windowId: 10, awakenedAt: 250 },
  ]);

  const candidate = await findMostRecentEligibleAwakenedTab(
    tracker,
    tabsApi,
    tabStateModel,
  );

  assert.equal(candidate.tab.id, 1);
  assert.deepEqual(tabsApi.getCalls, [2, 4, 3, 1]);
});

test("uses tab ID as a deterministic tie-breaker for simultaneous wakes", async () => {
  const tabsApi = createTabsApi([
    { id: 7, windowId: 10, active: false },
    { id: 5, windowId: 10, active: false },
  ]);
  const tracker = createTracker([
    { tabId: 7, windowId: 10, awakenedAt: 300 },
    { tabId: 5, windowId: 10, awakenedAt: 300 },
  ]);

  const candidate = await findMostRecentEligibleAwakenedTab(
    tracker,
    tabsApi,
    tabStateModel,
  );

  assert.equal(candidate.tab.id, 5);
  assert.deepEqual(tabsApi.getCalls, [5]);
});

test("selects the newest pinned candidate when pinned protection is disabled", async () => {
  const tabsApi = createTabsApi([
    { id: 1, windowId: 10, active: false },
    { id: 2, windowId: 10, pinned: true },
  ]);

  const candidate = await findMostRecentEligibleAwakenedTab(
    createTracker([
      { tabId: 1, windowId: 10, awakenedAt: 100 },
      { tabId: 2, windowId: 10, awakenedAt: 200 },
    ]),
    tabsApi,
    tabStateModel,
    { protectPinned: false, protectAudible: true },
  );

  assert.equal(candidate.tab.id, 2);
  assert.deepEqual(tabsApi.getCalls, [2]);
});

test("skips the newest pinned candidate when pinned protection is enabled", async () => {
  const tabsApi = createTabsApi([
    { id: 1, windowId: 10, active: false },
    { id: 2, windowId: 10, pinned: true },
  ]);

  const candidate = await findMostRecentEligibleAwakenedTab(
    createTracker([
      { tabId: 1, windowId: 10, awakenedAt: 100 },
      { tabId: 2, windowId: 10, awakenedAt: 200 },
    ]),
    tabsApi,
    tabStateModel,
    { protectPinned: true, protectAudible: true },
  );

  assert.equal(candidate.tab.id, 1);
  assert.deepEqual(tabsApi.getCalls, [2, 1]);
});

test("selects the newest audible candidate when audible protection is disabled", async () => {
  const tabsApi = createTabsApi([
    { id: 1, windowId: 10, active: false },
    { id: 2, windowId: 10, audible: true },
  ]);

  const candidate = await findMostRecentEligibleAwakenedTab(
    createTracker([
      { tabId: 1, windowId: 10, awakenedAt: 100 },
      { tabId: 2, windowId: 10, awakenedAt: 200 },
    ]),
    tabsApi,
    tabStateModel,
    { protectPinned: true, protectAudible: false },
  );

  assert.equal(candidate.tab.id, 2);
  assert.deepEqual(tabsApi.getCalls, [2]);
});

test("skips the newest audible candidate when audible protection is enabled", async () => {
  const tabsApi = createTabsApi([
    { id: 1, windowId: 10, active: false },
    { id: 2, windowId: 10, audible: true },
  ]);

  const candidate = await findMostRecentEligibleAwakenedTab(
    createTracker([
      { tabId: 1, windowId: 10, awakenedAt: 100 },
      { tabId: 2, windowId: 10, awakenedAt: 200 },
    ]),
    tabsApi,
    tabStateModel,
    { protectPinned: true, protectAudible: true },
  );

  assert.equal(candidate.tab.id, 1);
  assert.deepEqual(tabsApi.getCalls, [2, 1]);
});

test("fails safely without a candidate and never discards an arbitrary tab", async () => {
  const tabsApi = createTabsApi([
    { id: 1, windowId: 10, active: true },
    { id: 2, windowId: 10, pinned: true },
  ]);
  const discardCalls = [];

  const result = await sleepMostRecentEligibleAwakenedTab({
    recentlyAwakenedTracker: createTracker([
      { tabId: 1, windowId: 10, awakenedAt: 200 },
      { tabId: 2, windowId: 10, awakenedAt: 100 },
      { tabId: 3, windowId: 10, awakenedAt: 300 },
    ]),
    tabsApi,
    tabStateModel,
    async discardTabs(tabIds) {
      discardCalls.push(tabIds);
    },
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: noEligibleRecentTabReason,
  });
  assert.deepEqual(discardCalls, []);
});

test("delegates only the selected tab to the shared discard service", async () => {
  const tabsApi = createTabsApi([
    { id: 1, windowId: 10, active: false },
    { id: 2, windowId: 10, active: false },
  ]);
  const discardCalls = [];
  const sharedResult = {
    results: [{ status: "skipped", tabId: 2, reason: "active" }],
    summary: { discarded: 0, skipped: 1, failed: 0 },
  };

  const result = await sleepMostRecentEligibleAwakenedTab({
    recentlyAwakenedTracker: createTracker([
      { tabId: 1, windowId: 10, awakenedAt: 100 },
      { tabId: 2, windowId: 10, awakenedAt: 200 },
    ]),
    tabsApi,
    tabStateModel,
    policy: { protectPinned: false, protectAudible: true },
    async discardTabs(tabIds, options) {
      discardCalls.push({ tabIds, options });
      return sharedResult;
    },
  });

  assert.deepEqual(discardCalls, [
    {
      tabIds: [2],
      options: { policy: { protectPinned: false, protectAudible: true } },
    },
  ]);
  assert.equal(result.candidateTabId, 2);
  assert.equal(result.results[0].status, "skipped");
});

test("uses one policy snapshot for candidate selection and discard", async () => {
  const tabsApi = createTabsApi([{ id: 2, windowId: 10, pinned: true }]);
  const policy = { protectPinned: false, protectAudible: true };
  const selectionPolicies = [];
  const discardCalls = [];
  const policyAwareTabStateModel = {
    getDiscardEligibility(tab, appliedPolicy) {
      selectionPolicies.push(appliedPolicy);
      return {
        eligible: !tab.pinned || appliedPolicy.protectPinned === false,
      };
    },
  };

  await sleepMostRecentEligibleAwakenedTab({
    recentlyAwakenedTracker: createTracker([
      { tabId: 2, windowId: 10, awakenedAt: 200 },
    ]),
    tabsApi,
    tabStateModel: policyAwareTabStateModel,
    policy,
    async discardTabs(tabIds, options) {
      discardCalls.push({ tabIds, options });
      return { results: [], summary: { discarded: 1, skipped: 0, failed: 0 } };
    },
  });

  assert.equal(selectionPolicies[0], policy);
  assert.equal(discardCalls[0].options.policy, policy);
});
