importScripts("../lib/recent-awakened-state.js");

// Track only factual discarded-to-awake transitions. This deliberately makes no
// inference about why the tab woke and never schedules a re-discard.
const recentlyAwakenedTracker =
  globalThis.tabDiscarderRecentlyAwakenedState.createTracker({
    tabsApi: chrome.tabs,
    sessionStorage: chrome.storage.session,
  });

// Reconcile session-backed records whenever this MV3 worker starts. The tracker
// retains only tabs that still exist in this browser session and have matching
// IDs and window IDs.
void recentlyAwakenedTracker.initialize();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void recentlyAwakenedTracker.handleUpdated(tabId, changeInfo, tab);
});

chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
  void recentlyAwakenedTracker.handleAttached(tabId, attachInfo);
});

chrome.tabs.onCreated.addListener((tab) => {
  void recentlyAwakenedTracker.handleCreated(tab);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void recentlyAwakenedTracker.handleRemoved(tabId);
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  void recentlyAwakenedTracker.handleReplaced(addedTabId, removedTabId);
});
