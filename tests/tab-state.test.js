const test = require("node:test");
const assert = require("node:assert/strict");

const {
  states,
  deriveTabState,
  getDiscardEligibility,
} = require("../lib/tab-state.js");
const {
  getTabTitle,
  getTabPresentation,
} = require("../popup/tab-list.js");

test("derives the display state using the safety-first precedence", () => {
  assert.equal(deriveTabState({ active: true, discarded: true }), states.ACTIVE);
  assert.equal(deriveTabState({ discarded: true, audible: true }), states.SLEEPING);
  assert.equal(deriveTabState({ audible: true, pinned: true }), states.PLAYING_AUDIO);
  assert.equal(deriveTabState({ pinned: true }), states.PINNED);
  assert.equal(deriveTabState({}), states.AWAKE);
});

test("protects active and sleeping tabs from discard", () => {
  assert.deepEqual(getDiscardEligibility({ active: true }), {
    eligible: false,
    state: states.ACTIVE,
    reason: "active",
  });
  assert.deepEqual(getDiscardEligibility({ discarded: true }), {
    eligible: false,
    state: states.SLEEPING,
    reason: "sleeping",
  });
});

test("protects audible and pinned tabs by default", () => {
  assert.equal(getDiscardEligibility({ audible: true }).eligible, false);
  assert.equal(getDiscardEligibility({ pinned: true }).eligible, false);
  assert.equal(getDiscardEligibility({ audible: true, pinned: true }).eligible, false);
});

test("allows a normal awake background tab and supports future policy settings", () => {
  assert.deepEqual(getDiscardEligibility({}), {
    eligible: true,
    state: states.AWAKE,
    reason: null,
  });
  assert.equal(
    getDiscardEligibility({ audible: true }, { protectAudible: false }).eligible,
    true,
  );
  assert.equal(
    getDiscardEligibility({ pinned: true }, { protectPinned: false }).eligible,
    true,
  );
});

test("renders titles with useful fallbacks", () => {
  assert.equal(getTabTitle({ title: "  Project dashboard  " }), "Project dashboard");
  assert.equal(getTabTitle({ title: "", url: "https://example.com/path" }), "example.com");
  assert.equal(getTabTitle({ title: "", url: "chrome://settings" }), "settings");
  assert.equal(getTabTitle({}), "Untitled tab");
});

test("maps centralized state and eligibility to the tab-row presentation", () => {
  const tabStateModel = { deriveTabState, getDiscardEligibility };

  assert.deepEqual(getTabPresentation({ active: true }, tabStateModel), {
    kind: "badge",
    label: "Active",
  });
  assert.deepEqual(getTabPresentation({ discarded: true }, tabStateModel), {
    kind: "badge",
    label: "Sleeping",
  });
  assert.deepEqual(getTabPresentation({ audible: true }, tabStateModel), {
    kind: "badge",
    label: "Playing audio",
  });
  assert.deepEqual(getTabPresentation({ pinned: true }, tabStateModel), {
    kind: "badge",
    label: "Pinned",
  });
  assert.deepEqual(getTabPresentation({}, tabStateModel), {
    kind: "action",
    label: "Sleep",
  });
});
