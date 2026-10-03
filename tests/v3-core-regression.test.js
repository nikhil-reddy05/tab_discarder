const test = require("node:test");
const assert = require("node:assert/strict");

const tabStateModel = require("../lib/tab-state.js");
const { discardTabs, resultStatuses } = require("../lib/discard-service.js");
const { createTracker } = require("../lib/recent-awakened-state.js");
const { renderTabList } = require("../popup/tab-list.js");

function createTabsApi(tabs) {
  const tabsById = new Map(tabs.map((tab) => [tab.id, { ...tab }]));
  const discardCalls = [];

  return {
    discardCalls,
    async get(tabId) {
      return tabsById.get(tabId);
    },
    async discard(tabId) {
      discardCalls.push(tabId);
      const discardedTab = { ...tabsById.get(tabId), discarded: true };
      tabsById.set(tabId, discardedTab);
      return discardedTab;
    },
  };
}

function createSessionStorage(initialState) {
  const values = initialState ? { recentlyAwakenedState: initialState } : {};

  return {
    async get(key) {
      return { [key]: values[key] };
    },
    async set(nextValues) {
      Object.assign(values, nextValues);
    },
  };
}

function createElement() {
  return {
    attributes: new Map(),
    children: [],
    className: "",
    textContent: "",
    title: "",
    append(...children) {
      this.children.push(...children);
    },
    addEventListener() {},
    removeAttribute(name) {
      this.attributes.delete(name);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    classList: {
      remove() {},
    },
  };
}

test("keeps active, discarded, audible, and pinned tabs ineligible by default", () => {
  assert.equal(tabStateModel.getDiscardEligibility({ active: true }).eligible, false);
  assert.equal(tabStateModel.getDiscardEligibility({ discarded: true }).eligible, false);
  assert.equal(tabStateModel.getDiscardEligibility({ audible: true }).eligible, false);
  assert.equal(tabStateModel.getDiscardEligibility({ pinned: true }).eligible, false);
  assert.equal(tabStateModel.getDiscardEligibility({ active: false }).eligible, true);
});

test("Discard other tabs skips active and protected tabs while discarding normal backgrounds", async () => {
  const tabsApi = createTabsApi([
    { id: 1, active: true },
    { id: 2, audible: true },
    { id: 3, pinned: true },
    { id: 4, discarded: true },
    { id: 5, active: false },
  ]);

  const result = await discardTabs([1, 2, 3, 4, 5], {
    tabsApi,
    tabStateModel,
  });

  assert.deepEqual(tabsApi.discardCalls, [5]);
  assert.deepEqual(result.summary, { discarded: 1, skipped: 4, failed: 0 });
});

test("Discard group targets only its members and leaves an active member awake", async () => {
  const tabsApi = createTabsApi([
    { id: 1, groupId: 10, active: true },
    { id: 2, groupId: 10, active: false },
    { id: 3, groupId: 11, active: false },
    { id: 4, groupId: -1, active: false },
  ]);

  const result = await discardTabs([1, 2, 3, 4], {
    tabsApi,
    tabStateModel,
    shouldDiscardTab: (tab) => tab.groupId === 10,
  });

  assert.deepEqual(tabsApi.discardCalls, [2]);
  assert.equal(result.results[0].status, resultStatuses.SKIPPED);
  assert.equal(result.results[0].reason, "active");
  assert.equal(result.results[2].reason, "no-longer-targeted");
  assert.equal(result.results[3].reason, "no-longer-targeted");
});

test("tracks verified wakes without mistaking normal activation for one, and removes closed records", async () => {
  let clock = 1_000;
  const tracker = createTracker({
    tabsApi: { async query() { return [{ id: 1, windowId: 10, discarded: false }]; } },
    sessionStorage: createSessionStorage(),
    now: () => clock++,
  });

  await tracker.handleUpdated(1, { active: true }, {
    id: 1,
    windowId: 10,
    discarded: false,
  });
  assert.deepEqual(await tracker.getRecentlyAwakened(), []);

  await tracker.handleUpdated(1, { discarded: true }, {
    id: 1,
    windowId: 10,
    discarded: true,
  });
  await tracker.handleUpdated(1, { discarded: false }, {
    id: 1,
    windowId: 10,
    discarded: false,
  });
  assert.deepEqual(await tracker.getRecentlyAwakened(), [
    { tabId: 1, windowId: 10, awakenedAt: 1_000 },
  ]);

  await tracker.handleRemoved(1);
  assert.deepEqual(await tracker.getRecentlyAwakened(), []);
});

test("drops stale tracking and renders unsafe tab titles as text", async () => {
  const tracker = createTracker({
    tabsApi: { async query() { return []; } },
    sessionStorage: createSessionStorage({
      recentlyAwakenedTabs: {
        9: { tabId: 9, windowId: 90, awakenedAt: Date.now() },
      },
    }),
  });
  await tracker.initialize();
  assert.deepEqual(await tracker.getRecentlyAwakened(), []);

  const document = { createElement };
  const container = createElement();
  container.ownerDocument = document;
  const unsafeTitle = '<img src=x onerror="alert(1)">';

  renderTabList(container, [{ id: 5, title: unsafeTitle }], tabStateModel, () => {});

  assert.equal(container.children[0].children[0].children[1].textContent, unsafeTitle);
});
