const {
  keys: storageKeys,
  getProtectionSettings: loadProtectionSettings,
} = globalThis.tabDiscarderStorage;
const themeManager = globalThis.tabDiscarderTheme;
const { deriveTabState, states: tabStates } = globalThis.tabDiscarderTabState;
const { filterTabs } = globalThis.tabDiscarderTabFilter;
const { discardTabs, resultStatuses } = globalThis.tabDiscarderDiscardService;
const { renderTabList, renderTabListError, renderTabListNoResults } =
  globalThis.tabDiscarderTabList;
const { isGroupedTab, getUngroupedTabs, buildGroupSummaries, renderGroupList } =
  globalThis.tabDiscarderGroupList;
const { getRecentlyAwakenedRecords, sessionStorageKey } =
  globalThis.tabDiscarderRecentlyAwakenedState;
const { renderRecentlyAwakenedList } =
  globalThis.tabDiscarderRecentlyAwakenedList;

let currentWindowTabs = [];
let currentDiscardPolicy;
const LIVE_REFRESH_DELAY_MS = 100;
let liveRefreshTimer = null;
let liveUpdatesInitialized = false;
const MAX_TAB_REPLACEMENT_HOPS = 20;
const tabReplacementIds = new Map();
let replacementRefreshVersion = 0;
let replacementRefreshPending = false;
let pendingReplacementAwareActions = 0;

async function getDiscardPolicy() {
  return loadProtectionSettings();
}

async function initializeTheme() {
  await themeManager.initializeTheme({
    storage: globalThis.tabDiscarderStorage,
    documentScope: document,
    windowScope: window,
  });
}

function formatTabSummary(tabs) {
  const sleepingCount = tabs.filter(
    (tab) => deriveTabState(tab) === tabStates.SLEEPING,
  ).length;
  const awakeCount = tabs.length - sleepingCount;

  return `${awakeCount} awake · ${sleepingCount} discarded`;
}

async function renderCurrentWindowTabs() {
  const summary = document.getElementById("tabSummary");
  const tabList = document.getElementById("tabList");

  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const policy = await getDiscardPolicy();
    renderWindowTabs(tabs, policy);
    await renderCurrentWindowGroups(tabs, policy);
  } catch {
    summary.textContent = "Tab summary unavailable";
    renderTabListError(tabList);
  }
}

async function getLiveRecentlyAwakenedEntries() {
  if (!chrome.storage?.session?.get || !chrome.tabs?.get) {
    return [];
  }

  const stored = await chrome.storage.session.get(sessionStorageKey);
  const records = getRecentlyAwakenedRecords(stored?.[sessionStorageKey]);
  const liveEntries = await Promise.all(
    records.map(async (record) => {
      try {
        const tab = await chrome.tabs.get(record.tabId);

        // The worker normally removes these records when a tab closes or
        // sleeps again. Rechecking the live tab keeps the popup safe during
        // event-delivery races and avoids displaying a stale tab ID.
        if (
          tab.windowId !== record.windowId ||
          tab.discarded === true
        ) {
          return null;
        }

        return { ...record, tab };
      } catch {
        return null;
      }
    }),
  );

  return liveEntries.filter(Boolean);
}

async function renderRecentlyAwakenedTabs() {
  const section = document.getElementById("recentlyAwakenedSection");
  const list = document.getElementById("recentlyAwakenedList");

  try {
    const entries = await getLiveRecentlyAwakenedEntries();
    renderRecentlyAwakenedList(
      list,
      entries,
      globalThis.tabDiscarderTabState,
      globalThis.tabDiscarderTabList,
      sleepRecentlyAwakenedTab,
      undefined,
      await getDiscardPolicy(),
    );
    section.hidden = entries.length === 0;
  } catch {
    section.hidden = true;
    list.replaceChildren();
  }
}

function renderWindowTabs(tabs, policy) {
  currentWindowTabs = tabs;
  currentDiscardPolicy = policy;
  document.getElementById("tabSummary").textContent = formatTabSummary(tabs);
  updateSleepThisGroupAction(tabs);
  renderFilteredTabs();
}

function updateSleepThisGroupAction(tabs) {
  const action = document.getElementById("sleepThisGroup");
  const activeTab = tabs.find((tab) => tab.active === true);
  const isActiveTabGrouped = isGroupedTab(activeTab);

  action.hidden = !isActiveTabGrouped;
  action.disabled = !isActiveTabGrouped;
}

async function renderCurrentWindowGroups(tabs, policy) {
  const section = document.getElementById("groupsSection");
  const list = document.getElementById("groupsList");
  const windowId = tabs.find((tab) => Number.isInteger(tab.windowId))?.windowId;

  if (!Number.isInteger(windowId)) {
    section.hidden = true;
    list.replaceChildren();
    return;
  }

  try {
    // Group IDs are used only to join this live popup snapshot; they are never
    // persisted because Chrome does not guarantee them across browser sessions.
    const groups = await chrome.tabGroups.query({ windowId });
    const groupSummaries = buildGroupSummaries(
      groups,
      tabs,
      globalThis.tabDiscarderTabState,
    );
    renderGroupList(list, groupSummaries, sleepGroup, {
      tabListRenderer: globalThis.tabDiscarderTabList,
      tabStateModel: globalThis.tabDiscarderTabState,
      onSleepTab: sleepTab,
      discardPolicy: policy,
    });
    section.hidden = groupSummaries.length === 0;
  } catch {
    section.hidden = true;
    list.replaceChildren();
  }
}

async function sleepGroup(groupId) {
  const status = document.getElementById("bulkActionStatus");
  status.textContent = "Discarding eligible group tabs…";

  try {
    const memberTabs = await chrome.tabs.query({ groupId });
    const policy = await getDiscardPolicy();
    const result = await discardTabs(
      memberTabs.map((tab) => tab.id),
      {
        policy,
        // Re-check membership after the group query so a tab that moved to a
        // different group before discard is skipped rather than affected.
        shouldDiscardTab: (tab) => tab.groupId === groupId,
      },
    );
    status.textContent = formatBulkDiscardSummary(result.summary);
    return result;
  } catch {
    status.textContent = "Could not discard this group right now.";
    return { status: resultStatuses.ERROR };
  } finally {
    await refreshPopup();
  }
}

async function sleepThisGroup() {
  const action = document.getElementById("sleepThisGroup");
  const status = document.getElementById("bulkActionStatus");
  action.disabled = true;

  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const activeTab = tabs.find((tab) => tab.active === true);

    if (!isGroupedTab(activeTab)) {
      updateSleepThisGroupAction(tabs);
      status.textContent = "Active tab is not in a group.";
      return { status: resultStatuses.SKIPPED };
    }

    return await sleepGroup(activeTab.groupId);
  } catch {
    status.textContent = "Could not find the active tab's group right now.";
    return { status: resultStatuses.ERROR };
  } finally {
    action.disabled = false;
  }
}

function renderFilteredTabs() {
  const tabList = document.getElementById("tabList");
  const ungroupedTabs = getUngroupedTabs(currentWindowTabs);
  const filteredTabs = filterTabs(
    ungroupedTabs,
    document.getElementById("tabSearch").value,
  );

  if (filteredTabs.length === 0 && ungroupedTabs.length > 0) {
    renderTabListNoResults(tabList);
    return;
  }

  renderTabList(
    tabList,
    filteredTabs,
    globalThis.tabDiscarderTabState,
    sleepTab,
    currentDiscardPolicy,
  );
}

async function sleepTab(tabId) {
  const status = document.getElementById("bulkActionStatus");

  try {
    const { result, tabResult, stale } = await discardReplacementAwareTab(
      tabId,
      getDiscardPolicy(),
    );

    if (stale) {
      status.textContent = "Tab changed before it could be discarded.";
      return tabResult;
    }

    if (tabResult?.status === resultStatuses.SUCCESS || result.summary?.discarded) {
      status.textContent = "Tab discarded.";
    } else if (tabResult?.status === resultStatuses.SKIPPED || result.summary?.skipped) {
      status.textContent = "Tab is currently protected and was not discarded.";
    } else {
      status.textContent = "Could not discard this tab.";
    }
    return tabResult || result;
  } finally {
    await refreshPopup();
  }
}

async function sleepRecentlyAwakenedTab(tabId) {
  const status = document.getElementById("bulkActionStatus");

  try {
    // discardTabs re-fetches the tab and applies the shared safety policy
    // immediately before discard, so a tab that became active/protected since
    // this popup rendered is skipped rather than forced to sleep.
    const { result, tabResult, stale } = await discardReplacementAwareTab(
      tabId,
      getDiscardPolicy(),
    );

    if (stale) {
      status.textContent = "Tab changed before it could be discarded again.";
      return tabResult;
    }

    if (tabResult?.status === resultStatuses.SUCCESS || result.summary?.discarded) {
      status.textContent = "Tab discarded again.";
    } else if (tabResult?.status === resultStatuses.SKIPPED || result.summary?.skipped) {
      status.textContent = "Tab is currently protected and was not discarded.";
    } else {
      status.textContent = "Could not discard this tab again.";
    }

    return tabResult || result;
  } catch {
    status.textContent = "Could not discard this tab again.";
    return { status: resultStatuses.ERROR };
  } finally {
    await refreshPopup();
  }
}

function formatBulkDiscardSummary(summary) {
  const parts = [];

  if (summary.discarded > 0) {
    parts.push(`${summary.discarded} discarded`);
  }
  if (summary.skipped > 0) {
    parts.push(`${summary.skipped} skipped`);
  }
  if (summary.failed > 0) {
    parts.push(`${summary.failed} failed`);
  }

  return parts.length > 0 ? parts.join(" · ") : "No tabs to discard.";
}

function setCurrentWindowSleepActionsDisabled(disabled) {
  document.getElementById("sleepOtherTabs").disabled = disabled;
  document.getElementById("sleepThisWindow").disabled = disabled;
}

async function sleepEligibleBackgroundTabsInCurrentWindow() {
  const status = document.getElementById("bulkActionStatus");
  setCurrentWindowSleepActionsDisabled(true);
  status.textContent = "Discarding eligible tabs…";

  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const result = await discardTabs(tabs.map((tab) => tab.id), {
      policy: await getDiscardPolicy(),
    });
    status.textContent = formatBulkDiscardSummary(result.summary);
    await refreshPopup();
    return result;
  } catch {
    status.textContent = "Could not discard tabs right now.";
    return { status: resultStatuses.ERROR };
  } finally {
    setCurrentWindowSleepActionsDisabled(false);
  }
}

// Under the current V3 scope these labels have identical current-window
// semantics; separate wrappers retain their UI intent for a future
// cross-window action without duplicating the batch implementation.
function sleepOtherTabs() {
  return sleepEligibleBackgroundTabsInCurrentWindow();
}

function sleepThisWindow() {
  return sleepEligibleBackgroundTabsInCurrentWindow();
}

function initializeSearch() {
  document.getElementById("tabSearch").addEventListener("input", () => {
    renderFilteredTabs();
  });
}

function initializeQuickActions() {
  document
    .getElementById("sleepOtherTabs")
    .addEventListener("click", () => sleepOtherTabs());
  document
    .getElementById("sleepThisWindow")
    .addEventListener("click", () => sleepThisWindow());
  document
    .getElementById("sleepThisGroup")
    .addEventListener("click", () => sleepThisGroup());
}

async function openOptions() {
  try {
    await chrome.runtime.openOptionsPage();
  } catch {
    // The popup remains usable if Chrome cannot open the options page.
  }
}

function initializeOptionsLink() {
  document.getElementById("openOptions").addEventListener("click", openOptions);
}

function isTabId(tabId) {
  return Number.isInteger(tabId) && tabId >= 0;
}

function recordTabReplacement(addedTabId, removedTabId) {
  if (!isTabId(addedTabId) || !isTabId(removedTabId) || addedTabId === removedTabId) {
    return;
  }

  tabReplacementIds.set(removedTabId, addedTabId);
}

function resolveReplacementTabId(tabId) {
  if (!isTabId(tabId)) {
    return null;
  }

  let currentTabId = tabId;
  const visitedTabIds = new Set([currentTabId]);

  for (let hops = 0; hops < MAX_TAB_REPLACEMENT_HOPS; hops += 1) {
    const replacementTabId = tabReplacementIds.get(currentTabId);
    if (!isTabId(replacementTabId)) {
      return currentTabId;
    }

    if (visitedTabIds.has(replacementTabId)) {
      // A replacement chain should never cycle, but treating one as stale is
      // safer than risking an action against an unrelated or removed tab.
      return null;
    }

    visitedTabIds.add(replacementTabId);
    currentTabId = replacementTabId;
  }

  // Bound the chain so malformed or unexpected event sequences cannot loop.
  return null;
}

function isMissingTabResult(tabResult) {
  return (
    tabResult?.status === resultStatuses.ERROR &&
    /no tab with id/i.test(tabResult?.error?.message || "")
  );
}

function createStaleTabResult(tabId) {
  return {
    status: resultStatuses.SKIPPED,
    tabId,
    reason: "stale-tab",
  };
}

function clearReplacementIdsWhenUnused() {
  if (!replacementRefreshPending && pendingReplacementAwareActions === 0) {
    tabReplacementIds.clear();
  }
}

async function discardReplacementAwareTab(tabId, policyPromise) {
  pendingReplacementAwareActions += 1;

  try {
    const policy = await policyPromise;
    let targetTabId = resolveReplacementTabId(tabId);
    if (targetTabId === null) {
      return { tabResult: createStaleTabResult(tabId), stale: true };
    }

    let result = await discardTabs([targetTabId], { policy });
    let tabResult = result.results?.[0];

    // Chrome can replace a tab after the initial resolution but before the
    // discard service's live get. Retry only when onReplaced gives us a distinct
    // current ID; this is not a blind retry of a missing tab.
    if (isMissingTabResult(tabResult)) {
      const replacementTabId = resolveReplacementTabId(targetTabId);
      if (replacementTabId !== null && replacementTabId !== targetTabId) {
        targetTabId = replacementTabId;
        result = await discardTabs([targetTabId], { policy });
        tabResult = result.results?.[0];
      }
    }

    if (isMissingTabResult(tabResult)) {
      return {
        result,
        tabResult: createStaleTabResult(targetTabId),
        stale: true,
      };
    }

    return { result, tabResult, stale: false };
  } finally {
    pendingReplacementAwareActions -= 1;
    clearReplacementIdsWhenUnused();
  }
}

function scheduleLiveRefresh() {
  if (liveRefreshTimer !== null) {
    return;
  }

  liveRefreshTimer = globalThis.setTimeout(() => {
    liveRefreshTimer = null;
    void refreshPopup();
  }, LIVE_REFRESH_DELAY_MS);
}

function refreshForTabReplacement(addedTabId, removedTabId) {
  recordTabReplacement(addedTabId, removedTabId);

  if (liveRefreshTimer !== null) {
    globalThis.clearTimeout(liveRefreshTimer);
    liveRefreshTimer = null;
  }

  // A replacement invalidates a rendered row ID, so reconcile immediately
  // rather than leaving it until the normal event debounce elapses. The map is
  // popup-memory only and is cleared once the latest replacement refresh has
  // updated the UI, when stale row closures can no longer be used.
  const refreshVersion = ++replacementRefreshVersion;
  replacementRefreshPending = true;
  void refreshPopup().finally(() => {
    if (refreshVersion === replacementRefreshVersion) {
      replacementRefreshPending = false;
      clearReplacementIdsWhenUnused();
    }
  });
}

function addLiveUpdateListener(event, listener) {
  if (event?.addListener) {
    event.addListener(listener);
  }
}

function initializeLiveUpdates() {
  if (liveUpdatesInitialized) {
    return;
  }

  liveUpdatesInitialized = true;
  const tabs = chrome.tabs;
  const tabGroups = chrome.tabGroups;

  addLiveUpdateListener(tabs?.onActivated, scheduleLiveRefresh);
  addLiveUpdateListener(tabs?.onCreated, scheduleLiveRefresh);
  addLiveUpdateListener(tabs?.onRemoved, scheduleLiveRefresh);
  addLiveUpdateListener(tabs?.onReplaced, refreshForTabReplacement);
  addLiveUpdateListener(tabs?.onAttached, scheduleLiveRefresh);
  addLiveUpdateListener(tabs?.onDetached, scheduleLiveRefresh);
  addLiveUpdateListener(tabs?.onMoved, scheduleLiveRefresh);
  addLiveUpdateListener(tabs?.onUpdated, scheduleLiveRefresh);

  // Group events cover title/color changes as well as membership changes that
  // Chrome reports at the group layer.
  addLiveUpdateListener(tabGroups?.onCreated, scheduleLiveRefresh);
  addLiveUpdateListener(tabGroups?.onUpdated, scheduleLiveRefresh);
  addLiveUpdateListener(tabGroups?.onMoved, scheduleLiveRefresh);
  addLiveUpdateListener(tabGroups?.onRemoved, scheduleLiveRefresh);
}

async function refreshPopup() {
  await Promise.all([renderCurrentWindowTabs(), renderRecentlyAwakenedTabs()]);
}

void initializeTheme();
initializeSearch();
initializeQuickActions();
initializeOptionsLink();
initializeLiveUpdates();
refreshPopup();
