const { keys: storageKeys, get: getStoredSetting, set: setStoredSetting } =
  globalThis.tabDiscarderStorage;
const { deriveTabState, states: tabStates } = globalThis.tabDiscarderTabState;

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

async function renderTabSummary() {
  const summary = document.getElementById("tabSummary");

  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    summary.textContent = formatTabSummary(tabs);
  } catch {
    summary.textContent = "Tab summary unavailable";
  }
}

theme();
renderTabSummary();
