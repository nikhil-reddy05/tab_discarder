(function registerTabStateModel(globalScope) {
  const TAB_STATES = Object.freeze({
    ACTIVE: "active",
    SLEEPING: "sleeping",
    PLAYING_AUDIO: "playing-audio",
    PINNED: "pinned",
    AWAKE: "awake",
  });

  const DISCARD_REASONS = Object.freeze({
    ACTIVE: "active",
    SLEEPING: "sleeping",
    PLAYING_AUDIO: "playing-audio",
    PINNED: "pinned",
  });

  const DEFAULT_DISCARD_POLICY = Object.freeze({
    protectAudible: true,
    protectPinned: true,
  });

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

    return { eligible: true, state, reason: null };
  }

  const tabStateModel = Object.freeze({
    states: TAB_STATES,
    defaultDiscardPolicy: DEFAULT_DISCARD_POLICY,
    deriveTabState,
    getDiscardEligibility,
  });

  globalScope.tabDiscarderTabState = tabStateModel;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = tabStateModel;
  }
})(globalThis);
