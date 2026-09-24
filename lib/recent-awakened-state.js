(function registerRecentlyAwakenedState(globalScope) {
  const SESSION_STORAGE_KEY = "recentlyAwakenedState";

  function isTabId(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function isWindowId(value) {
    return Number.isInteger(value);
  }

  function emptyState() {
    return {
      discardedTabs: {},
      recentlyAwakenedTabs: {},
    };
  }

  function cloneRecord(record) {
    return {
      tabId: record.tabId,
      windowId: record.windowId,
      awakenedAt: record.awakenedAt,
    };
  }

  function readState(value) {
    const state = emptyState();
    const candidate = value && typeof value === "object" ? value : {};

    for (const [tabIdKey, record] of Object.entries(
      candidate.discardedTabs || {},
    )) {
      const tabId = Number(tabIdKey);
      if (
        isTabId(tabId) &&
        record &&
        record.tabId === tabId &&
        isWindowId(record.windowId)
      ) {
        state.discardedTabs[tabId] = {
          tabId,
          windowId: record.windowId,
        };
      }
    }

    for (const [tabIdKey, record] of Object.entries(
      candidate.recentlyAwakenedTabs || {},
    )) {
      const tabId = Number(tabIdKey);
      if (
        isTabId(tabId) &&
        record &&
        record.tabId === tabId &&
        isWindowId(record.windowId) &&
        Number.isFinite(record.awakenedAt)
      ) {
        state.recentlyAwakenedTabs[tabId] = cloneRecord(record);
      }
    }

    return state;
  }

  function serializeState(state) {
    return {
      discardedTabs: { ...state.discardedTabs },
      recentlyAwakenedTabs: Object.fromEntries(
        Object.entries(state.recentlyAwakenedTabs).map(([tabId, record]) => [
          tabId,
          cloneRecord(record),
        ]),
      ),
    };
  }

  const RECENTLY_AWAKENED_TTL_MS = 10 * 60 * 1000;

  function getRecentlyAwakenedRecords(value, now = Date.now) {
    return Object.values(readState(value).recentlyAwakenedTabs)
      .filter((record) => now() - record.awakenedAt <= RECENTLY_AWAKENED_TTL_MS)
      .map(cloneRecord)
      .sort((left, right) => right.awakenedAt - left.awakenedAt);
  }

  function createTracker({ tabsApi, sessionStorage, now = Date.now } = {}) {
    let state = emptyState();
    let initialization;
    let pending = Promise.resolve();

    async function persist() {
      if (!sessionStorage?.set) {
        return;
      }

      await sessionStorage.set({
        [SESSION_STORAGE_KEY]: serializeState(state),
      });
    }

    async function reconcileCurrentTabs() {
      if (!tabsApi?.query) {
        state = emptyState();
        return;
      }

      let tabs;
      try {
        tabs = await tabsApi.query({});
      } catch {
        // If the current browser session cannot be verified, discard the
        // session-only history rather than risk exposing a stale tab ID.
        state = emptyState();
        return;
      }

      const currentTabs = new Map(
        tabs
          .filter((tab) => isTabId(tab.id) && isWindowId(tab.windowId))
          .map((tab) => [tab.id, tab]),
      );
      const reconciled = emptyState();

      for (const tab of currentTabs.values()) {
        if (tab.discarded === true) {
          // Seed live sleeping tabs even when this worker has no earlier
          // session record, so a later explicit wake can be recognized.
          reconciled.discardedTabs[tab.id] = {
            tabId: tab.id,
            windowId: tab.windowId,
          };
          continue;
        }

        const discardedRecord = state.discardedTabs[tab.id];
        if (discardedRecord && discardedRecord.windowId === tab.windowId) {
          reconciled.recentlyAwakenedTabs[tab.id] = {
            tabId: tab.id,
            windowId: tab.windowId,
            awakenedAt: now(),
          };
          continue;
        }

        const awakenedRecord = state.recentlyAwakenedTabs[tab.id];
        if (awakenedRecord && awakenedRecord.windowId === tab.windowId) {
          reconciled.recentlyAwakenedTabs[tab.id] = {
            ...awakenedRecord,
            windowId: tab.windowId,
          };
        }
      }

      state = reconciled;
    }

    async function initialize() {
      if (!initialization) {
        initialization = (async () => {
          try {
            const stored = sessionStorage?.get
              ? await sessionStorage.get(SESSION_STORAGE_KEY)
              : {};
            state = readState(stored?.[SESSION_STORAGE_KEY]);
          } catch {
            state = emptyState();
          }

          await reconcileCurrentTabs();
          try {
            await persist();
          } catch {
            // The in-memory state remains valid for this worker lifetime.
          }
        })();
      }

      return initialization;
    }

    function enqueue(change) {
      const operation = pending.then(async () => {
        await initialize();
        await change();
        try {
          await persist();
        } catch {
          // Session persistence is best-effort; never let an event handler
          // create an unhandled rejection in the service worker.
        }
      });
      pending = operation.catch(() => {});
      return operation;
    }

    function invalidate(tabId) {
      delete state.discardedTabs[tabId];
      delete state.recentlyAwakenedTabs[tabId];
    }

    return Object.freeze({
      initialize,
      handleUpdated(tabId, changeInfo, tab) {
        if (!isTabId(tabId) || typeof changeInfo?.discarded !== "boolean") {
          return Promise.resolve();
        }

        return enqueue(() => {
          if (!isWindowId(tab?.windowId)) {
            invalidate(tabId);
            return;
          }

          if (changeInfo.discarded === true) {
            state.discardedTabs[tabId] = {
              tabId,
              windowId: tab.windowId,
            };
            delete state.recentlyAwakenedTabs[tabId];
            return;
          }

          const discardedRecord = state.discardedTabs[tabId];
          if (!discardedRecord) {
            invalidate(tabId);
            return;
          }

          delete state.discardedTabs[tabId];
          state.recentlyAwakenedTabs[tabId] = {
            tabId,
            windowId: tab.windowId,
            awakenedAt: now(),
          };
        });
      },
      handleAttached(tabId, attachInfo) {
        if (!isTabId(tabId) || !isWindowId(attachInfo?.newWindowId)) {
          return Promise.resolve();
        }

        return enqueue(() => {
          const discardedRecord = state.discardedTabs[tabId];
          if (discardedRecord) {
            discardedRecord.windowId = attachInfo.newWindowId;
          }

          const awakenedRecord = state.recentlyAwakenedTabs[tabId];
          if (awakenedRecord) {
            awakenedRecord.windowId = attachInfo.newWindowId;
          }
        });
      },
      handleCreated(tab) {
        return isTabId(tab?.id)
          ? enqueue(() => invalidate(tab.id))
          : Promise.resolve();
      },
      handleRemoved(tabId) {
        return isTabId(tabId)
          ? enqueue(() => invalidate(tabId))
          : Promise.resolve();
      },
      handleReplaced(addedTabId, removedTabId) {
        return enqueue(() => {
          if (isTabId(removedTabId)) {
            invalidate(removedTabId);
          }
          if (isTabId(addedTabId)) {
            invalidate(addedTabId);
          }
        });
      },
      getRecentlyAwakened() {
        // Capture the current tail of the mutation queue. A popup that opens
        // immediately after an onUpdated wake event must not read before that
        // already-queued update has committed.
        return pending.then(async () => {
          await initialize();
          return getRecentlyAwakenedRecords(state);
        });
      },
    });
  }

  const recentlyAwakenedState = Object.freeze({
    sessionStorageKey: SESSION_STORAGE_KEY,
    createTracker,
    getRecentlyAwakenedRecords,
  });

  globalScope.tabDiscarderRecentlyAwakenedState = recentlyAwakenedState;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = recentlyAwakenedState;
  }
})(globalThis);
