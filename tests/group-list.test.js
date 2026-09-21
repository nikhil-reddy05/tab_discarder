const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getUngroupedTabs,
  getGroupTitle,
  getGroupColor,
  buildGroupSummaries,
} = require("../popup/group-list.js");

const tabStateModel = {
  states: { SLEEPING: "sleeping" },
  deriveTabState(tab) {
    return tab.discarded ? "sleeping" : "awake";
  },
};

test("builds one factual summary per live Chrome group", () => {
  const summaries = buildGroupSummaries(
    [
      { id: 10, title: "Research", color: "blue" },
      { id: 11, title: "", color: "purple" },
    ],
    [
      { id: 1, groupId: 10 },
      { id: 2, groupId: 10, discarded: true },
      { id: 3, groupId: 11, discarded: true },
      { id: 4, groupId: -1 },
    ],
    tabStateModel,
  );

  assert.deepEqual(summaries, [
    {
      groupId: 10,
      title: "Research",
      color: "#1a73e8",
      totalCount: 2,
      awakeCount: 1,
      sleepingCount: 1,
    },
    {
      groupId: 11,
      title: "Untitled group",
      color: "#a142f4",
      totalCount: 1,
      awakeCount: 0,
      sleepingCount: 1,
    },
  ]);
});

test("keeps only ungrouped tabs in This window and safely falls back for metadata", () => {
  assert.deepEqual(
    getUngroupedTabs([{ id: 1, groupId: -1 }, { id: 2, groupId: 4 }, { id: 3 }]),
    [{ id: 1, groupId: -1 }, { id: 3 }],
  );
  assert.equal(getGroupTitle({ title: "  " }), "Untitled group");
  assert.equal(getGroupColor({ color: "unknown" }), "#5f6368");
});
