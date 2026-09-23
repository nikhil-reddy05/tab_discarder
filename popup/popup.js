const { keys: storageKeys, get: getStoredSetting, set: setStoredSetting } =
  globalThis.tabDiscarderStorage;
const { deriveTabState, states: tabStates } = globalThis.tabDiscarderTabState;
const { filterTabs } = globalThis.tabDiscarderTabFilter;
const { discardTab, discardTabs, resultStatuses } =
  globalThis.tabDiscarderDiscardService;
const { renderTabList, renderTabListError, renderTabListNoResults } =
  globalThis.tabDiscarderTabList;
const { isGroupedTab, getUngroupedTabs, buildGroupSummaries, renderGroupList } =
  globalThis.tabDiscarderGroupList;

let currentWindowTabs = [];

function isTheme(value) {
  return value === "light" || value === "dark";
}

function getLegacyTheme() {
  try {
    return window.localStorage.getItem(storageKeys.THEME);
  } catch {
    return null;
  }
}

function clearLegacyTheme() {
  try {
    window.localStorage.removeItem(storageKeys.THEME);
  } catch {
    // The migrated theme remains available in extension storage.
  }
}

function applyTheme(currentTheme) {
  document.documentElement.setAttribute("data-theme", currentTheme);
  document.getElementById("toggleTheme").checked = currentTheme === "dark";
}

async function theme() {
  let currentTheme = await getStoredSetting(storageKeys.THEME);

  if (!isTheme(currentTheme)) {
    const legacyTheme = getLegacyTheme();
    currentTheme = isTheme(legacyTheme) ? legacyTheme : "light";

    if (
      isTheme(legacyTheme) &&
      (await setStoredSetting(storageKeys.THEME, legacyTheme))
    ) {
      clearLegacyTheme();
    }
  }

  applyTheme(currentTheme);

  document.getElementById("toggleTheme").addEventListener("change", async () => {
    const newTheme = document.getElementById("toggleTheme").checked
      ? "dark"
      : "light";
    applyTheme(newTheme);
    await setStoredSetting(storageKeys.THEME, newTheme);
  });
}

function formatTabSummary(tabs) {
  const sleepingCount = tabs.filter(
    (tab) => deriveTabState(tab) === tabStates.SLEEPING,
  ).length;
  const awakeCount = tabs.length - sleepingCount;

  return `${awakeCount} awake · ${sleepingCount} sleeping`;
}

async function renderCurrentWindowTabs() {
  const summary = document.getElementById("tabSummary");
  const tabList = document.getElementById("tabList");

  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    renderWindowTabs(tabs);
    await renderCurrentWindowGroups(tabs);
  } catch {
    summary.textContent = "Tab summary unavailable";
    renderTabListError(tabList);
  }
}

function renderWindowTabs(tabs) {
  currentWindowTabs = tabs;
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

async function renderCurrentWindowGroups(tabs) {
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
    });
    section.hidden = groupSummaries.length === 0;
  } catch {
    section.hidden = true;
    list.replaceChildren();
  }
}

async function sleepGroup(groupId) {
  const status = document.getElementById("bulkActionStatus");
  status.textContent = "Sleeping eligible group tabs…";

  try {
    const memberTabs = await chrome.tabs.query({ groupId });
    const result = await discardTabs(
      memberTabs.map((tab) => tab.id),
      {
        // Re-check membership after the group query so a tab that moved to a
        // different group before discard is skipped rather than affected.
        shouldDiscardTab: (tab) => tab.groupId === groupId,
      },
    );
    status.textContent = formatBulkDiscardSummary(result.summary);
    return result;
  } catch {
    status.textContent = "Could not sleep this group right now.";
    return { status: resultStatuses.ERROR };
  } finally {
    await renderCurrentWindowTabs();
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
  );
}

async function sleepTab(tabId) {
  const status = document.getElementById("bulkActionStatus");

  try {
    const result = await discardTab(tabId);
    status.textContent =
      result.status === resultStatuses.SUCCESS
        ? "Tab slept."
        : "Could not sleep this tab.";
    return result;
  } finally {
    await renderCurrentWindowTabs();
  }
}

function formatBulkDiscardSummary(summary) {
  const parts = [];

  if (summary.discarded > 0) {
    parts.push(`${summary.discarded} slept`);
  }
  if (summary.skipped > 0) {
    parts.push(`${summary.skipped} skipped`);
  }
  if (summary.failed > 0) {
    parts.push(`${summary.failed} failed`);
  }

  return parts.length > 0 ? parts.join(" · ") : "No tabs to sleep.";
}

function setCurrentWindowSleepActionsDisabled(disabled) {
  document.getElementById("sleepOtherTabs").disabled = disabled;
  document.getElementById("sleepThisWindow").disabled = disabled;
}

async function sleepEligibleBackgroundTabsInCurrentWindow() {
  const status = document.getElementById("bulkActionStatus");
  setCurrentWindowSleepActionsDisabled(true);
  status.textContent = "Sleeping eligible tabs…";

  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const result = await discardTabs(tabs.map((tab) => tab.id));
    status.textContent = formatBulkDiscardSummary(result.summary);
    await renderCurrentWindowTabs();
    return result;
  } catch {
    status.textContent = "Could not sleep tabs right now.";
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

theme();
initializeSearch();
initializeQuickActions();
renderCurrentWindowTabs();
