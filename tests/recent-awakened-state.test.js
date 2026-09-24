const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTracker,
  getRecentlyAwakenedRecords,
  sessionStorageKey,
} = require("../lib/recent-awakened-state.js");

function createSessionStorage(initialState) {
  const values = initialState ? { [sessionStorageKey]: initialState } : {};

  return {
    values,
    async get(key) {
      return { [key]: values[key] };
    },
    async set(nextValues) {
      Object.assign(values, nextValues);
    },
  };
}

function createTabsApi(tabs) {
  return {
    async query() {
      return tabs;
    },
  };
}

test("does not record a normal awake tab merely for becoming active", async () => {
  const tracker = createTracker({
    tabsApi: createTabsApi([{ id: 1, windowId: 10, discarded: false }]),
    sessionStorage: createSessionStorage(),
  });

  await tracker.handleUpdated(1, { active: true }, {
    id: 1,
    windowId: 10,
    discarded: false,
  });
  await tracker.handleUpdated(1, { discarded: false }, {
    id: 1,
    windowId: 10,
    discarded: false,
  });

  assert.deepEqual(await tracker.getRecentlyAwakened(), []);
});

test("records a known discarded tab only after it becomes awake", async () => {
  let clock = 100;
  const storage = createSessionStorage();
  const tracker = createTracker({
    tabsApi: createTabsApi([{ id: 2, windowId: 20, discarded: false }]),
    sessionStorage: storage,
    now: () => clock++,
  });

  await tracker.handleUpdated(2, { discarded: true }, {
    id: 2,
    windowId: 20,
    discarded: true,
  });
  assert.deepEqual(await tracker.getRecentlyAwakened(), []);

  await tracker.handleUpdated(2, { discarded: false }, {
    id: 2,
    windowId: 20,
    discarded: false,
  });

  assert.deepEqual(await tracker.getRecentlyAwakened(), [
    { tabId: 2, windowId: 20, awakenedAt: 100 },
  ]);
  assert.deepEqual(storage.values[sessionStorageKey].discardedTabs, {});
});

test("waits for an already-queued wake before reading recent history", async () => {
  const tracker = createTracker({
    tabsApi: createTabsApi([{ id: 6, windowId: 60, discarded: false }]),
    sessionStorage: createSessionStorage(),
    now: () => 600,
  });

  await tracker.handleUpdated(6, { discarded: true }, {
    id: 6,
    windowId: 60,
    discarded: true,
  });
  const queuedWake = tracker.handleUpdated(6, { discarded: false }, {
    id: 6,
    windowId: 60,
    discarded: false,
  });

  assert.deepEqual(await tracker.getRecentlyAwakened(), [
    { tabId: 6, windowId: 60, awakenedAt: 600 },
  ]);
  await queuedWake;
});

test("preserves a known sleeping tab when it moves to another window", async () => {
  const tracker = createTracker({
    tabsApi: createTabsApi([{ id: 7, windowId: 70, discarded: false }]),
    sessionStorage: createSessionStorage(),
    now: () => 700,
  });

  await tracker.handleUpdated(7, { discarded: true }, {
    id: 7,
    windowId: 70,
    discarded: true,
  });
  await tracker.handleAttached(7, { newWindowId: 71, newPosition: 0 });
  await tracker.handleUpdated(7, { discarded: false }, {
    id: 7,
    windowId: 71,
    discarded: false,
  });

  assert.deepEqual(await tracker.getRecentlyAwakened(), [
    { tabId: 7, windowId: 71, awakenedAt: 700 },
  ]);
});

test("seeds an already-discarded tab during initialization before its wake", async () => {
  const storage = createSessionStorage();
  const tracker = createTracker({
    tabsApi: createTabsApi([{ id: 8, windowId: 80, discarded: true }]),
    sessionStorage: storage,
    now: () => 800,
  });

  await tracker.initialize();
  assert.deepEqual(storage.values[sessionStorageKey].discardedTabs, {
    8: { tabId: 8, windowId: 80 },
  });

  await tracker.handleUpdated(8, { discarded: false }, {
    id: 8,
    windowId: 80,
    discarded: false,
  });

  assert.deepEqual(await tracker.getRecentlyAwakened(), [
    { tabId: 8, windowId: 80, awakenedAt: 800 },
  ]);
});

test("invalidates tracked entries when a tab closes, is created, or is replaced", async () => {
  const tracker = createTracker({
    tabsApi: createTabsApi([{ id: 3, windowId: 30, discarded: false }]),
    sessionStorage: createSessionStorage(),
    now: () => 300,
  });

  await tracker.handleUpdated(3, { discarded: true }, {
    id: 3,
    windowId: 30,
    discarded: true,
  });
  await tracker.handleUpdated(3, { discarded: false }, {
    id: 3,
    windowId: 30,
    discarded: false,
  });
  await tracker.handleRemoved(3);
  assert.deepEqual(await tracker.getRecentlyAwakened(), []);

  await tracker.handleUpdated(3, { discarded: true }, {
    id: 3,
    windowId: 30,
    discarded: true,
  });
  await tracker.handleCreated({ id: 3, windowId: 30 });
  await tracker.handleUpdated(3, { discarded: false }, {
    id: 3,
    windowId: 30,
    discarded: false,
  });
  assert.deepEqual(await tracker.getRecentlyAwakened(), []);

  await tracker.handleUpdated(3, { discarded: true }, {
    id: 3,
    windowId: 30,
    discarded: true,
  });
  await tracker.handleReplaced(4, 3);
  await tracker.handleUpdated(3, { discarded: false }, {
    id: 3,
    windowId: 30,
    discarded: false,
  });
  assert.deepEqual(await tracker.getRecentlyAwakened(), []);
});

test("drops session records that do not match tabs in the current browser session", async () => {
  const storage = createSessionStorage({
    discardedTabs: {
      4: { tabId: 4, windowId: 40 },
    },
    recentlyAwakenedTabs: {
      5: { tabId: 5, windowId: 50, awakenedAt: 123 },
    },
  });
  const tracker = createTracker({
    tabsApi: createTabsApi([{ id: 4, windowId: 41, discarded: false }]),
    sessionStorage: storage,
  });

  await tracker.initialize();

  assert.deepEqual(await tracker.getRecentlyAwakened(), []);
  assert.deepEqual(storage.values[sessionStorageKey], {
    discardedTabs: {},
    recentlyAwakenedTabs: {},
  });
});

test("returns only valid recent records in newest-first order for the popup", () => {
  assert.deepEqual(
    getRecentlyAwakenedRecords({
      recentlyAwakenedTabs: {
        1: { tabId: 1, windowId: 10, awakenedAt: 100 },
        2: { tabId: 2, windowId: 20, awakenedAt: 200 },
        stale: { tabId: 3, windowId: 30 },
      },
    }),
    [
      { tabId: 2, windowId: 20, awakenedAt: 200 },
      { tabId: 1, windowId: 10, awakenedAt: 100 },
    ],
  );
});
