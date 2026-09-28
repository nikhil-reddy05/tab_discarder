const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getUngroupedTabs,
  getGroupTitle,
  getGroupColor,
  getGroupColorClass,
  buildGroupSummaries,
} = require("../popup/group-list.js");

const tabStateModel = {
  states: { SLEEPING: "sleeping" },
  deriveTabState(tab) {
    return tab.discarded ? "sleeping" : "awake";
  },
};

function createFakeElement() {
  const listeners = new Map();

  return {
    attributes: new Map(),
    children: [],
    className: "",
    hidden: false,
    id: "",
    style: {},
    textContent: "",
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    append(...children) {
      this.children.push(...children);
    },
    getAttribute(name) {
      return this.attributes.get(name);
    },
    getListener(type) {
      return listeners.get(type);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
  };
}

function createFakeDocument() {
  return {
    createElement() {
      return createFakeElement();
    },
  };
}

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
      colorClass: "group-color--blue",
      memberTabs: [
        { id: 1, groupId: 10 },
        { id: 2, groupId: 10, discarded: true },
      ],
      totalCount: 2,
      awakeCount: 1,
      sleepingCount: 1,
    },
    {
      groupId: 11,
      title: "Untitled group",
      color: "#a142f4",
      colorClass: "group-color--purple",
      memberTabs: [{ id: 3, groupId: 11, discarded: true }],
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
  assert.equal(getGroupColorClass({ color: "orange" }), "group-color--orange");
  assert.equal(getGroupColorClass({ color: "unknown" }), "group-color--grey");
});

test("maps every Chrome group color to a stable chip class", () => {
  const expectedColors = {
    grey: "#5f6368",
    blue: "#1a73e8",
    red: "#d93025",
    yellow: "#f9ab00",
    green: "#188038",
    pink: "#d01884",
    purple: "#a142f4",
    cyan: "#007b83",
    orange: "#e8710a",
  };

  for (const [color, value] of Object.entries(expectedColors)) {
    assert.equal(getGroupColor({ color }), value);
    assert.equal(getGroupColorClass({ color }), `group-color--${color}`);
  }
});

test("expands and collapses current members with the shared tab-row renderer", () => {
  const { renderGroupList } = require("../popup/group-list.js");
  const document = createFakeDocument();
  const container = createFakeElement();
  container.ownerDocument = document;
  const renderedMembers = [];
  const memberTabs = [{ id: 1, groupId: 10 }, { id: 2, groupId: 10 }];
  const discardPolicy = { protectPinned: false, protectAudible: true };
  const tabListRenderer = {
    renderTabList(list, tabs, stateModel, onSleep, policy) {
      renderedMembers.push({ list, tabs, stateModel, onSleep, policy });
    },
  };

  renderGroupList(
    container,
    [
      {
        groupId: 10,
        title: "Research",
        color: "#1a73e8",
        colorClass: "group-color--blue",
        memberTabs,
        totalCount: 2,
        awakeCount: 2,
        sleepingCount: 0,
      },
    ],
    () => {},
    { tabListRenderer, tabStateModel, onSleepTab: () => {}, discardPolicy },
  );

  const row = container.children[0];
  const header = row.children[0];
  const color = header.children[0];
  const actions = header.children[2];
  const expandAction = actions.children[0];
  const memberList = row.children[1];

  assert.deepEqual(renderedMembers[0].tabs, memberTabs);
  assert.equal(renderedMembers[0].stateModel, tabStateModel);
  assert.equal(renderedMembers[0].policy, discardPolicy);
  assert.equal(memberList.hidden, true);
  assert.equal(color.className, "group-color group-color--blue");
  assert.equal(actions.className, "group-actions");
  assert.equal(memberList.getAttribute("aria-labelledby"), "group-title-10");
  assert.equal(expandAction.getAttribute("aria-expanded"), "false");
  assert.equal(expandAction.getAttribute("aria-label"), "Show tabs in Research");
  assert.equal(expandAction.textContent, "⌄");

  expandAction.getListener("click")();
  assert.equal(memberList.hidden, false);
  assert.equal(expandAction.getAttribute("aria-expanded"), "true");
  assert.equal(expandAction.getAttribute("aria-label"), "Hide tabs in Research");
  assert.equal(expandAction.textContent, "⌃");

  expandAction.getListener("click")();
  assert.equal(memberList.hidden, true);
  assert.equal(expandAction.getAttribute("aria-expanded"), "false");
  assert.equal(expandAction.textContent, "⌄");
});

test("popup CSS visually hides a member list after its second toggle", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "../popup/popup.css"),
    "utf8",
  );

  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});
