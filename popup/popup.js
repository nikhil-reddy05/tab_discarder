function theme() {
  const currentTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", currentTheme);
  document.getElementById("toggleTheme").checked = currentTheme === "dark";

  document.getElementById("toggleTheme").addEventListener("change", () => {
    const newTheme = document.getElementById("toggleTheme").checked
      ? "dark"
      : "light";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
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
