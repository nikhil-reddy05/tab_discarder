(function registerTabListRenderer(globalScope) {
  const STATE_LABELS = Object.freeze({
    active: "Active",
    sleeping: "Sleeping",
    "playing-audio": "Playing audio",
    pinned: "Pinned",
  });

  function getTabTitle(tab) {
    if (typeof tab?.title === "string" && tab.title.trim()) {
      return tab.title.trim();
    }

    if (typeof tab?.url === "string") {
      try {
        const hostname = new URL(tab.url).hostname;
        if (hostname) {
          return hostname;
        }
      } catch {
        // A missing or non-standard tab URL uses the generic fallback below.
      }
    }

    return "Untitled tab";
  }

  function getTabPresentation(tab, tabStateModel) {
    const state = tabStateModel.deriveTabState(tab);
    const eligibility = tabStateModel.getDiscardEligibility(tab);

    if (eligibility.eligible) {
      return { kind: "action", label: "Sleep" };
    }

    return { kind: "badge", label: STATE_LABELS[state] || "Awake" };
  }

  function createFavicon(document, tab) {
    const favicon = document.createElement("span");
    favicon.className = "tab-favicon";
    favicon.setAttribute("aria-hidden", "true");

    const fallback = document.createElement("span");
    fallback.className = "tab-favicon-fallback";
    fallback.textContent = "▧";
    favicon.append(fallback);

    if (typeof tab.favIconUrl !== "string" || !tab.favIconUrl.trim()) {
      return favicon;
    }

    const image = document.createElement("img");
    image.className = "tab-favicon-image";
    image.alt = "";
    image.src = tab.favIconUrl;
    image.addEventListener("load", () => {
      fallback.hidden = true;
    });
    image.addEventListener("error", () => {
      image.hidden = true;
      fallback.hidden = false;
    });
    favicon.append(image);

    return favicon;
  }

  function createTabRow(document, tab, tabStateModel, onSleep) {
    const row = document.createElement("li");
    row.className = "tab-row";

    const details = document.createElement("div");
    details.className = "tab-details";
    details.append(createFavicon(document, tab));

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = getTabTitle(tab);
    title.title = typeof tab.url === "string" ? tab.url : "";
    details.append(title);
    row.append(details);

    const presentation = getTabPresentation(tab, tabStateModel);
    if (presentation.kind === "action") {
      const action = document.createElement("button");
      action.className = "tab-sleep-action";
      action.type = "button";
      action.textContent = presentation.label;
      action.title = "Sleep this tab";
      action.addEventListener("click", async () => {
        action.disabled = true;
        action.textContent = "Sleeping…";

        try {
          await onSleep(tab.id);
        } catch {
          action.disabled = false;
          action.textContent = presentation.label;
        }
      });
      row.append(action);
    } else {
      const badge = document.createElement("span");
      badge.className = "tab-state-badge";
      badge.textContent = presentation.label;
      row.append(badge);
    }

    return row;
  }

  function renderTabList(container, tabs, tabStateModel, onSleep) {
    container.replaceChildren();
    container.classList.remove("empty-section");
    container.removeAttribute("role");

    for (const tab of tabs) {
      container.append(
        createTabRow(container.ownerDocument, tab, tabStateModel, onSleep),
      );
    }
  }

  function renderTabListError(container) {
    container.replaceChildren();
    container.classList.add("empty-section");
    container.setAttribute("role", "status");
    container.textContent = "Tabs are unavailable right now.";
  }

  function renderTabListNoResults(container) {
    container.replaceChildren();
    container.classList.add("empty-section");
    container.setAttribute("role", "status");
    container.textContent = "No matching tabs. Clear the search to see all tabs.";
  }

  const tabListRenderer = Object.freeze({
    getTabTitle,
    getTabPresentation,
    createFavicon,
    renderTabList,
    renderTabListError,
    renderTabListNoResults,
  });

  globalScope.tabDiscarderTabList = tabListRenderer;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = tabListRenderer;
  }
})(globalThis);
