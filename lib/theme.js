(function registerThemeManager(globalScope) {
  const preferences = Object.freeze({
    SYSTEM: "system",
    LIGHT: "light",
    DARK: "dark",
  });

  function isThemePreference(value) {
    return Object.values(preferences).includes(value);
  }

  function resolveTheme(preference, mediaQuery) {
    if (preference === preferences.DARK) {
      return preferences.DARK;
    }

    if (preference === preferences.LIGHT) {
      return preferences.LIGHT;
    }

    return mediaQuery?.matches ? preferences.DARK : preferences.LIGHT;
  }

  function getLegacyThemePreference(windowScope, storageKey) {
    try {
      const value = windowScope?.localStorage?.getItem(storageKey);
      return value === preferences.LIGHT || value === preferences.DARK
        ? value
        : null;
    } catch {
      return null;
    }
  }

  async function loadThemePreference(storage, windowScope) {
    const storedPreference = await storage.get(storage.keys.THEME);
    if (isThemePreference(storedPreference)) {
      return storedPreference;
    }

    const legacyPreference = getLegacyThemePreference(windowScope, storage.keys.THEME);
    if (legacyPreference && await storage.set(storage.keys.THEME, legacyPreference)) {
      try {
        windowScope.localStorage.removeItem(storage.keys.THEME);
      } catch {
        // The shared-storage value remains available if legacy cleanup fails.
      }
      return legacyPreference;
    }

    return preferences.SYSTEM;
  }

  function applyTheme(documentScope, preference, mediaQuery) {
    const resolvedTheme = resolveTheme(preference, mediaQuery);
    const root = documentScope.documentElement;

    if (root.dataset) {
      root.dataset.theme = resolvedTheme;
    } else {
      root.setAttribute("data-theme", resolvedTheme);
    }

    return resolvedTheme;
  }

  function addMediaQueryListener(mediaQuery, listener) {
    if (typeof mediaQuery?.addEventListener === "function") {
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }

    if (typeof mediaQuery?.addListener === "function") {
      mediaQuery.addListener(listener);
      return () => mediaQuery.removeListener(listener);
    }

    return () => {};
  }

  async function initializeTheme({ storage, documentScope, windowScope }) {
    const mediaQuery = typeof windowScope?.matchMedia === "function"
      ? windowScope.matchMedia("(prefers-color-scheme: dark)")
      : null;
    let preference = await loadThemePreference(storage, windowScope);

    function applyCurrentTheme() {
      return applyTheme(documentScope, preference, mediaQuery);
    }

    const removeMediaQueryListener = addMediaQueryListener(mediaQuery, () => {
      if (preference === preferences.SYSTEM) {
        applyCurrentTheme();
      }
    });

    applyCurrentTheme();

    return {
      get preference() {
        return preference;
      },
      async setPreference(nextPreference) {
        if (!isThemePreference(nextPreference)) {
          return false;
        }

        const saved = await storage.set(storage.keys.THEME, nextPreference);
        if (saved) {
          preference = nextPreference;
          applyCurrentTheme();
        }

        return saved;
      },
      dispose() {
        removeMediaQueryListener();
      },
    };
  }

  globalScope.tabDiscarderTheme = Object.freeze({
    preferences,
    isThemePreference,
    resolveTheme,
    loadThemePreference,
    applyTheme,
    initializeTheme,
  });
})(globalThis);
