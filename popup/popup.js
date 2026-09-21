const { keys: storageKeys, get: getStoredSetting, set: setStoredSetting } =
  globalThis.tabDiscarderStorage;
const { deriveTabState, states: tabStates } = globalThis.tabDiscarderTabState;
const { filterTabs } = globalThis.tabDiscarderTabFilter;
const { discardTab, resultStatuses } = globalThis.tabDiscarderDiscardService;
const { renderTabList, renderTabListError, renderTabListNoResults } =
  globalThis.tabDiscarderTabList;

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
  } catch {
    summary.textContent = "Tab summary unavailable";
    renderTabListError(tabList);
  }
}

function renderWindowTabs(tabs) {
  currentWindowTabs = tabs;
  document.getElementById("tabSummary").textContent = formatTabSummary(tabs);
  renderFilteredTabs();
}

function renderFilteredTabs() {
  const tabList = document.getElementById("tabList");
  const filteredTabs = filterTabs(
    currentWindowTabs,
    document.getElementById("tabSearch").value,
  );

  if (filteredTabs.length === 0 && currentWindowTabs.length > 0) {
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
  const result = await discardTab(tabId);

  if (result.status === resultStatuses.SUCCESS || result.status === resultStatuses.SKIPPED) {
    renderWindowTabs(
      currentWindowTabs.map((tab) => (tab.id === tabId ? result.tab : tab)),
    );
    return result;
  }

  renderWindowTabs(currentWindowTabs);
  return result;
}

function initializeSearch() {
  document.getElementById("tabSearch").addEventListener("input", () => {
    renderFilteredTabs();
  });
}

theme();
initializeSearch();
renderCurrentWindowTabs();
