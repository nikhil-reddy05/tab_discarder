(function registerRecentlyAwakenedList(globalScope) {
  const STATE_LABELS = Object.freeze({
    active: "Active",
    sleeping: "Sleeping",
    "playing-audio": "Playing audio",
    pinned: "Pinned",
  });

  function formatRelativeTime(awakenedAt, now = Date.now()) {
    const elapsedSeconds = Math.max(0, Math.floor((now - awakenedAt) / 1000));

    if (elapsedSeconds < 60) {
      return "Just now";
    }

    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) {
      return `${elapsedMinutes}m ago`;
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) {
      return `${elapsedHours}h ago`;
    }

    return `${Math.floor(elapsedHours / 24)}d ago`;
  }

  function getRecentTabPresentation(tab, tabStateModel) {
    const eligibility = tabStateModel.getDiscardEligibility(tab);
    if (eligibility.eligible) {
      return { kind: "action", label: "Sleep again" };
    }

    return {
      kind: "badge",
      label: STATE_LABELS[eligibility.state] || "Awake",
    };
  }

  function createRecentAwakenedRow(
    document,
    entry,
    tabStateModel,
    tabListRenderer,
    onSleepAgain,
    now,
  ) {
    const row = document.createElement("li");
    row.className = "recent-awakened-row";

    const details = document.createElement("div");
    details.className = "tab-details";
    details.append(tabListRenderer.createFavicon(document, entry.tab));

    const text = document.createElement("div");
    text.className = "recent-awakened-details";

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tabListRenderer.getTabTitle(entry.tab);
    title.title = typeof entry.tab.url === "string" ? entry.tab.url : "";
    text.append(title);

    const timing = document.createElement("span");
    timing.className = "recent-awakened-timing";
    timing.textContent = `Awakened ${formatRelativeTime(entry.awakenedAt, now)}`;
    text.append(timing);

    details.append(text);
    row.append(details);

    const presentation = getRecentTabPresentation(entry.tab, tabStateModel);
    if (presentation.kind === "action") {
      const action = document.createElement("button");
      action.className = "recent-awakened-sleep-action";
      action.type = "button";
      action.textContent = presentation.label;
      action.title = "Sleep this tab again";
      action.addEventListener("click", async () => {
        action.disabled = true;
        action.textContent = "Sleeping…";

        try {
          await onSleepAgain(entry.tab.id);
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

  function renderRecentlyAwakenedList(
    container,
    entries,
    tabStateModel,
    tabListRenderer,
    onSleepAgain,
    now,
  ) {
    container.replaceChildren();

    for (const entry of entries) {
      container.append(
        createRecentAwakenedRow(
          container.ownerDocument,
          entry,
          tabStateModel,
          tabListRenderer,
          onSleepAgain,
          now,
        ),
      );
    }
  }

  const recentlyAwakenedList = Object.freeze({
    formatRelativeTime,
    getRecentTabPresentation,
    renderRecentlyAwakenedList,
  });

  globalScope.tabDiscarderRecentlyAwakenedList = recentlyAwakenedList;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = recentlyAwakenedList;
  }
})(globalThis);
