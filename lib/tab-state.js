(function registerTabStateModel(globalScope) {
  const TAB_STATES = Object.freeze({
    ACTIVE: "active",
    SLEEPING: "sleeping",
    PLAYING_AUDIO: "playing-audio",
    PINNED: "pinned",
    PROTECTED_DOMAIN: "protected-domain",
    AWAKE: "awake",
  });

  const DISCARD_REASONS = Object.freeze({
    ACTIVE: "active",
    SLEEPING: "sleeping",
    PLAYING_AUDIO: "playing-audio",
    PINNED: "pinned",
    PROTECTED_DOMAIN: "protected-domain",
  });

  const DEFAULT_DISCARD_POLICY = Object.freeze({
    protectAudible: true,
    protectPinned: true,
    protectedDomains: [],
  });

  // Entries are hostnames only: no wildcard, path, port, or scheme. Matching
  // is case-insensitive and protects the exact hostname plus its subdomains.
  function normalizeProtectedDomain(value) {
    if (typeof value !== "string") {
      return null;
    }

    const domain = value.trim().toLowerCase().replace(/\.+$/, "");
    if (
      !domain ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/.test(
        domain,
      )
    ) {
      return null;
    }

    return domain;
  }

  function getTabHostname(tab) {
    if (typeof tab?.url !== "string") {
      return null;
    }

    try {
      const hostname = new URL(tab.url).hostname.toLowerCase().replace(/\.+$/, "");
      return hostname || null;
    } catch {
      return null;
    }
  }

  function getMatchingProtectedDomain(tab, protectedDomains) {
    const hostname = getTabHostname(tab);
    if (!hostname || !Array.isArray(protectedDomains)) {
      return null;
    }

    for (const value of protectedDomains) {
      const domain = normalizeProtectedDomain(value);
      if (domain && (hostname === domain || hostname.endsWith(`.${domain}`))) {
        return domain;
      }
    }

    return null;
  }

  function deriveTabState(tab) {
    if (tab && tab.active === true) {
      return TAB_STATES.ACTIVE;
    }

    if (tab && tab.discarded === true) {
      return TAB_STATES.SLEEPING;
    }

    if (tab && tab.audible === true) {
      return TAB_STATES.PLAYING_AUDIO;
    }

    if (tab && tab.pinned === true) {
      return TAB_STATES.PINNED;
    }

    return TAB_STATES.AWAKE;
  }

  function getDiscardEligibility(tab, policy = DEFAULT_DISCARD_POLICY) {
    const state = deriveTabState(tab);
    const resolvedPolicy = {
      ...DEFAULT_DISCARD_POLICY,
      ...policy,
    };

    if (state === TAB_STATES.ACTIVE) {
      return { eligible: false, state, reason: DISCARD_REASONS.ACTIVE };
    }

    if (state === TAB_STATES.SLEEPING) {
      return { eligible: false, state, reason: DISCARD_REASONS.SLEEPING };
    }

    if (tab && tab.audible === true && resolvedPolicy.protectAudible) {
      return {
        eligible: false,
        state,
        reason: DISCARD_REASONS.PLAYING_AUDIO,
      };
    }

    if (tab && tab.pinned === true && resolvedPolicy.protectPinned) {
      return { eligible: false, state, reason: DISCARD_REASONS.PINNED };
    }

    const protectedDomain = getMatchingProtectedDomain(
      tab,
      resolvedPolicy.protectedDomains,
    );
    if (protectedDomain) {
      return {
        eligible: false,
        state: TAB_STATES.PROTECTED_DOMAIN,
        reason: DISCARD_REASONS.PROTECTED_DOMAIN,
        protectedDomain,
      };
    }

    return { eligible: true, state, reason: null };
  }

  const tabStateModel = Object.freeze({
    states: TAB_STATES,
    defaultDiscardPolicy: DEFAULT_DISCARD_POLICY,
    deriveTabState,
    normalizeProtectedDomain,
    getTabHostname,
    getMatchingProtectedDomain,
    getDiscardEligibility,
  });

  globalScope.tabDiscarderTabState = tabStateModel;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = tabStateModel;
  }
})(globalThis);
