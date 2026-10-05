(function registerRecentlyAwakenedList(globalScope) {
  const STATE_LABELS = Object.freeze({
    active: "Active",
    discarded: "Discarded",
    "playing-audio": "Playing audio",
    pinned: "Pinned",
    "protected-domain": "Protected site",
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

  function getRecentTabPresentation(tab, tabStateModel, policy) {
    const eligibility = tabStateModel.getDiscardEligibility(tab, policy);
    if (eligibility.eligible) {
      return { kind: "action", label: "Discard again" };
    }

    return {
      kind: "badge",
      label: STATE_LABELS[eligibility.reason] || STATE_LABELS[eligibility.state] || "Awake",
      tone: getBadgeTone(eligibility.reason || eligibility.state),
    };
  }

  function getBadgeTone(state) {
    if (state === "discarded") {
      return "discarded";
    }

    if (["playing-audio", "pinned", "protected-domain"].includes(state)) {
      return "protected";
    }

    return "informational";
  }

  function createRecentAwakenedRow(
    document,
    entry,
    tabStateModel,
    tabListRenderer,
    onDiscardAgain,
    now,
    policy,
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

    const presentation = getRecentTabPresentation(entry.tab, tabStateModel, policy);
    if (presentation.kind === "action") {
      const action = document.createElement("button");
      action.className = "recent-awakened-discard-action";
      action.type = "button";
      action.textContent = presentation.label;
      action.title = "Discard this tab again";
      action.addEventListener("click", async () => {
        action.disabled = true;
        action.textContent = "Discarding…";

        try {
          await onDiscardAgain(entry.tab.id);
        } catch {
          action.disabled = false;
          action.textContent = presentation.label;
        }
      });
      row.append(action);
    } else {
      const badge = document.createElement("span");
      badge.className = `tab-state-badge tab-state-badge--${presentation.tone}`;
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
    onDiscardAgain,
    now,
    policy,
  ) {
    container.replaceChildren();

    for (const entry of entries) {
      container.append(
        createRecentAwakenedRow(
          container.ownerDocument,
          entry,
          tabStateModel,
          tabListRenderer,
          onDiscardAgain,
          now,
          policy,
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
