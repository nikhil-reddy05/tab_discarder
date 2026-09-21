(function registerDiscardService(globalScope) {
  const RESULT_STATUSES = Object.freeze({
    SUCCESS: "success",
    SKIPPED: "skipped",
    ERROR: "error",
  });

  function getErrorDetails(error) {
    return {
      message: error instanceof Error ? error.message : String(error),
    };
  }

  async function discardTab(
    tabId,
    {
      tabsApi = globalScope.chrome?.tabs,
      tabStateModel = globalScope.tabDiscarderTabState,
    } = {},
  ) {
    if (!tabsApi || !tabStateModel) {
      return {
        status: RESULT_STATUSES.ERROR,
        tabId,
        error: { message: "Tab discard service is unavailable." },
      };
    }

    let tab;
    try {
      tab = await tabsApi.get(tabId);
    } catch (error) {
      return {
        status: RESULT_STATUSES.ERROR,
        tabId,
        error: getErrorDetails(error),
      };
    }

    const eligibility = tabStateModel.getDiscardEligibility(tab);
    if (!eligibility.eligible) {
      return {
        status: RESULT_STATUSES.SKIPPED,
        tabId,
        tab,
        reason: eligibility.reason,
        state: eligibility.state,
      };
    }

    try {
      const discardedTab = await tabsApi.discard(tabId);
      return {
        status: RESULT_STATUSES.SUCCESS,
        tabId,
        tab: discardedTab || { ...tab, discarded: true },
      };
    } catch (error) {
      return {
        status: RESULT_STATUSES.ERROR,
        tabId,
        tab,
        error: getErrorDetails(error),
      };
    }
  }

  async function discardTabs(
    tabIds,
    {
      tabsApi = globalScope.chrome?.tabs,
      tabStateModel = globalScope.tabDiscarderTabState,
      discardOne,
    } = {},
  ) {
    const discard =
      discardOne ||
      ((tabId) => discardTab(tabId, { tabsApi, tabStateModel }));
    const results = [];
    const summary = {
      discarded: 0,
      skipped: 0,
      failed: 0,
    };

    for (const tabId of Array.isArray(tabIds) ? tabIds : []) {
      let result;

      try {
        result = await discard(tabId);
      } catch (error) {
        result = {
          status: RESULT_STATUSES.ERROR,
          tabId,
          error: getErrorDetails(error),
        };
      }

      results.push(result);

      if (result.status === RESULT_STATUSES.SUCCESS) {
        summary.discarded += 1;
      } else if (result.status === RESULT_STATUSES.SKIPPED) {
        summary.skipped += 1;
      } else {
        summary.failed += 1;
      }
    }

    return { results, summary };
  }

  const discardService = Object.freeze({
    resultStatuses: RESULT_STATUSES,
    discardTab,
    discardTabs,
  });

  globalScope.tabDiscarderDiscardService = discardService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = discardService;
  }
})(globalThis);
