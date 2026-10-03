(function registerTabListRenderer(globalScope) {
  const STATE_LABELS = Object.freeze({
    active: "Active",
    sleeping: "Discarded",
    "playing-audio": "Playing audio",
    pinned: "Pinned",
    "protected-domain": "Protected site",
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

  function getTabPresentation(tab, tabStateModel, policy) {
    const state = tabStateModel.deriveTabState(tab);
    const eligibility = tabStateModel.getDiscardEligibility(tab, policy);

    if (eligibility.eligible) {
      return { kind: "action", label: "Discard" };
    }

    return {
      kind: "badge",
      label: STATE_LABELS[eligibility.reason] || STATE_LABELS[state] || "Awake",
    };
  }

  function getFaviconUrl(tab, runtime = globalScope.chrome?.runtime) {
    if (typeof tab?.url !== "string" || !tab.url.trim()) {
      return null;
    }

    try {
      new URL(tab.url);

      if (typeof runtime?.getURL !== "function") {
        return null;
      }

      const url = new URL(runtime.getURL("/_favicon/"));
      url.searchParams.set("pageUrl", tab.url);
      url.searchParams.set("size", "32");
      return url.toString();
    } catch {
      return null;
    }
  }

  function createFavicon(document, tab, runtime) {
    const favicon = document.createElement("span");
    favicon.className = "tab-favicon";
    favicon.setAttribute("aria-hidden", "true");

    const fallback = document.createElement("span");
    fallback.className = "tab-favicon-fallback";
    fallback.textContent = "▧";
    favicon.append(fallback);

    const faviconUrl = getFaviconUrl(tab, runtime);
    if (!faviconUrl) {
      return favicon;
    }

    const image = document.createElement("img");
    image.className = "tab-favicon-image";
    image.alt = "";
    image.src = faviconUrl;
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

  function createTabRow(document, tab, tabStateModel, onSleep, policy) {
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

    const presentation = getTabPresentation(tab, tabStateModel, policy);
    if (presentation.kind === "action") {
      const action = document.createElement("button");
      action.className = "tab-sleep-action";
      action.type = "button";
      action.textContent = presentation.label;
      action.title = "Discard this tab";
      action.addEventListener("click", async () => {
        action.disabled = true;
        action.textContent = "Discarding…";

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

  function renderTabList(container, tabs, tabStateModel, onSleep, policy) {
    container.replaceChildren();
    container.classList.remove("empty-section");
    container.removeAttribute("role");

    for (const tab of tabs) {
      container.append(
        createTabRow(container.ownerDocument, tab, tabStateModel, onSleep, policy),
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
    getFaviconUrl,
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
