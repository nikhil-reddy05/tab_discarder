(function registerRecentlyAwakenedCommand(globalScope) {
  const NO_ELIGIBLE_RECENT_TAB = "no-eligible-recently-awakened-tab";

  function isValidRecord(record) {
    return (
      record &&
      Number.isInteger(record.tabId) &&
      Number.isInteger(record.windowId) &&
      Number.isFinite(record.awakenedAt)
    );
  }

  async function findMostRecentEligibleAwakenedTab(
    recentlyAwakenedTracker,
    tabsApi,
    tabStateModel,
    policy,
  ) {
    const records = await recentlyAwakenedTracker.getRecentlyAwakened();
    const orderedRecords = records
      .filter(isValidRecord)
      // A tab ID tie-breaker makes simultaneous wake events deterministic.
      .sort(
        (left, right) =>
          right.awakenedAt - left.awakenedAt || left.tabId - right.tabId,
      );

    for (const record of orderedRecords) {
      let tab;
      try {
        tab = await tabsApi.get(record.tabId);
      } catch {
        continue;
      }

      // The session tracker normally removes stale IDs. This guard also makes
      // the command safe if Chrome has reused an ID before an event arrives.
      if (tab?.id !== record.tabId || tab.windowId !== record.windowId) {
        continue;
      }

      if (tabStateModel.getDiscardEligibility(tab, policy).eligible) {
        return { record, tab };
      }
    }

    return null;
  }

  async function discardMostRecentEligibleAwakenedTab({
    recentlyAwakenedTracker,
    tabsApi,
    tabStateModel,
    policy,
    discardTabs,
  }) {
    const candidate = await findMostRecentEligibleAwakenedTab(
      recentlyAwakenedTracker,
      tabsApi,
      tabStateModel,
      policy,
    );

    if (!candidate) {
      return {
        status: "skipped",
        reason: NO_ELIGIBLE_RECENT_TAB,
      };
    }

    // discardTabs performs a second live eligibility check immediately before
    // discarding. If this selected tab becomes active or protected meanwhile,
    // it is skipped rather than replaced with another candidate.
    const result = await discardTabs([candidate.tab.id], { policy });
    return {
      ...result,
      candidateTabId: candidate.tab.id,
    };
  }

  const recentlyAwakenedCommand = Object.freeze({
    noEligibleRecentTabReason: NO_ELIGIBLE_RECENT_TAB,
    findMostRecentEligibleAwakenedTab,
    discardMostRecentEligibleAwakenedTab,
  });

  globalScope.tabDiscarderRecentlyAwakenedCommand = recentlyAwakenedCommand;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = recentlyAwakenedCommand;
  }
})(globalThis);
