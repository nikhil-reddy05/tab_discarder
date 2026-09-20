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

    div.innerHTML = `
      <span class="tab-title" title="${tab.url}">${tab.title || tab.url}</span>
      <button data-tabid="${tab.id}" ${isInactive ? "disabled" : ""}>
        ${isInactive ? "Already Inactive" : "Discard"}
      </button>
    `;
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
