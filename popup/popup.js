const { keys: storageKeys, get: getStoredSetting, set: setStoredSetting } =
  globalThis.tabDiscarderStorage;

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

async function renderTabs() {
  const tabList = document.getElementById("tabList");
  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    const div = document.createElement("div");
    div.className = "tab-item";

    const isInactive = tab.discarded === true;
    const title = document.createElement("span");
    title.className = "tab-title";
    title.title = tab.url;
    title.textContent = tab.title || tab.url;

    const button = document.createElement("button");
    button.dataset.tabid = tab.id;
    button.disabled = isInactive;
    button.textContent = isInactive ? "Already Inactive" : "Discard";

    div.append(title, button);
    tabList.appendChild(div);
  }

  tabList.addEventListener("click", async (e) => {
    if (e.target.tagName === "BUTTON" && !e.target.disabled) {
      const tabId = parseInt(e.target.getAttribute("data-tabid"));
      const discarded = await chrome.tabs.discard(tabId);
      if (discarded && discarded.discarded === true) {
        e.target.textContent = "Discarded";
        e.target.disabled = true;
      } else {
        e.target.textContent = "Not Discardable";
        e.target.disabled = true;
      }
    }
  });
}

theme();
renderTabs();
