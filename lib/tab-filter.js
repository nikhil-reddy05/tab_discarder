(function registerTabFilter(globalScope) {
  function normalizeSearchText(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
  }

  function matchesTabSearch(tab, query) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return true;
    }

    const searchableText = [tab?.title, tab?.url]
      .filter((value) => typeof value === "string")
      .join("\n")
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  }

  function filterTabs(tabs, query) {
    if (!Array.isArray(tabs)) {
      return [];
    }

    return tabs.filter((tab) => matchesTabSearch(tab, query));
  }

  const tabFilter = Object.freeze({
    matchesTabSearch,
    filterTabs,
  });

  globalScope.tabDiscarderTabFilter = tabFilter;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = tabFilter;
  }
})(globalThis);
