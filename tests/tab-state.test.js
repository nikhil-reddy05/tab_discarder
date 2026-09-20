const test = require("node:test");
const assert = require("node:assert/strict");

const {
  states,
  deriveTabState,
  getDiscardEligibility,
} = require("../lib/tab-state.js");

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
